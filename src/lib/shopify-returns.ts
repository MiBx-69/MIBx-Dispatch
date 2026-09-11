import { createServiceClient } from "@/lib/supabase/server";

interface HandleShopifyReturnOptions {
  shopifyOrderId: number | string;
  refundData: any; // from refunds/create or order payload
  topic: string;
}

export async function handleShopifyRefundOrReturn({
  shopifyOrderId,
  refundData,
  topic,
}: HandleShopifyReturnOptions) {
  const supabase = createServiceClient();
  const numOrderId = Number(shopifyOrderId);

  // 1. Fetch order from Supabase
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, shopify_order_name, total_price, line_items, pathao_consignment_id, internal_status, cancel_reason, fulfillment_status, created_at")
    .eq("shopify_order_id", numOrderId)
    .maybeSingle();

  if (orderErr || !order) {
    console.warn(`[Shopify Return Sync] Order not found in database for Shopify Order ID: ${shopifyOrderId}`);
    return { success: false, reason: "Order not found" };
  }

  // 2. Fetch associated dispatch if any
  const { data: dispatch } = await supabase
    .from("dispatches")
    .select("id, consignment_id")
    .eq("order_id", order.id)
    .maybeSingle();

  const consignmentId = order.pathao_consignment_id || dispatch?.consignment_id || null;
  const orderLineItems = (order.line_items as any[]) || [];
  const totalOrderQty = orderLineItems.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 1), 0);
  const totalOrderPrice = Number(order.total_price) || 0;

  // 3. Extract refund line items, amounts, and notes
  let refundLineItems: any[] = [];
  let refundTotalAmount = 0;
  let refundNote = refundData.note || "Refunded via Shopify";

  const noteLower = (refundNote || "").toLowerCase();
  const isCancelled =
    order.internal_status === "cancelled" ||
    Boolean(order.cancel_reason) ||
    Boolean(refundData.cancelled_at) ||
    Boolean(refundData.cancel_reason) ||
    noteLower.includes("order canceled") ||
    noteLower.includes("order cancelled") ||
    refundData.financial_status === "voided";

  if (isCancelled) {
    console.log(`[Shopify Return] Order ${order.shopify_order_name} is cancelled (${refundNote}). Ensuring internal_status is cancelled, NOT returned.`);
    // Clean up any stale return record
    await supabase.from("returns").delete().eq("order_id", order.id);

    await supabase
      .from("orders")
      .update({
        internal_status: "cancelled",
        cancel_reason: order.cancel_reason || refundData.cancel_reason || refundNote || "Cancelled via Shopify",
        returned_at: null,
        return_reason: null,
        return_delivery_fee: 0,
      })
      .eq("id", order.id);

    return {
      success: true,
      type: "cancelled",
      status: "cancelled",
      message: "Order is cancelled. Kept status as cancelled.",
    };
  }

  // Check if order was never dispatched or fulfilled
  const hasEverDispatched = Boolean(
    consignmentId || 
    dispatch || 
    order.fulfillment_status === "fulfilled" || 
    order.internal_status === "dispatched" || 
    order.internal_status === "delivered"
  );

  if (!hasEverDispatched && (refundData.financial_status === "refunded" || refundData.financial_status === "voided" || noteLower.includes("cancel"))) {
    console.log(`[Shopify Return] Order ${order.shopify_order_name} was never dispatched/fulfilled. A refund on an undispatched order is a cancellation/void, not a parcel return.`);
    await supabase.from("returns").delete().eq("order_id", order.id);
    await supabase
      .from("orders")
      .update({
        internal_status: "cancelled",
        cancel_reason: order.cancel_reason || refundData.cancel_reason || refundNote || "Refunded before dispatch",
        returned_at: null,
        return_reason: null,
        return_delivery_fee: 0,
      })
      .eq("id", order.id);

    return {
      success: true,
      type: "cancelled",
      status: "cancelled",
      message: "Undispatched order refunded. Marked as cancelled.",
    };
  }

  if (Array.isArray(refundData.refund_line_items) && refundData.refund_line_items.length > 0) {
    // Direct from refunds/create payload
    refundLineItems = refundData.refund_line_items;
    
    // Calculate total from transactions or items subtotal
    if (Array.isArray(refundData.transactions) && refundData.transactions.length > 0) {
      refundTotalAmount = refundData.transactions.reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0);
    } else {
      refundTotalAmount = refundLineItems.reduce((sum: number, rli: any) => {
        const itemPrice = Number(rli.subtotal || rli.price || rli.line_item?.price || 0);
        return sum + itemPrice;
      }, 0);
    }
  } else if (Array.isArray(refundData.refunds) && refundData.refunds.length > 0) {
    // From orders/updated payload containing refunds array
    refundData.refunds.forEach((r: any) => {
      if (Array.isArray(r.refund_line_items)) {
        refundLineItems.push(...r.refund_line_items);
      }
      if (Array.isArray(r.transactions)) {
        r.transactions.forEach((tx: any) => {
          refundTotalAmount += Number(tx.amount) || 0;
        });
      }
      if (r.note) refundNote = r.note;
    });
  }

  // Calculate refunded quantities and formatted items
  let totalRefundedQty = 0;
  const returnedItemsList: any[] = [];
  refundLineItems.forEach((rli: any) => {
    const qty = Number(rli.quantity) || 1;
    totalRefundedQty += qty;
    const title = rli.line_item?.title || rli.title || "Refunded Item";
    const variant = rli.line_item?.variant_title || rli.variant_title || "";
    const name = variant ? `${title} (${variant})` : title;
    const price = Number(rli.subtotal || rli.line_item?.price || rli.price || 0);
    returnedItemsList.push({
      name,
      quantity: qty,
      price: price > 0 ? price : undefined,
    });
  });

  // 4. Distinguish PARTIAL vs FULL Return
  // Critical requirement:
  // "make sure that no partial order mark as returned partial order ened admin approval and attention so move it to a attentions ection or admin approved seciton"
  const isExplicitPartial = refundData.financial_status === "partially_refunded";
  const isQtyPartial = totalRefundedQty > 0 && totalRefundedQty < totalOrderQty;
  const isAmountPartial = refundTotalAmount > 0 && refundTotalAmount < (totalOrderPrice - 5);

  const isPartial = isExplicitPartial || isQtyPartial || (isAmountPartial && totalRefundedQty < totalOrderQty);

  // Check if a return record already exists
  const { data: existingReturn } = await supabase
    .from("returns")
    .select("id, status, is_verified, return_type")
    .eq("order_id", order.id)
    .maybeSingle();

  const now = new Date().toISOString();

  if (isPartial) {
    // ==========================================
    // PARTIAL RETURN HANDLING
    // ==========================================
    console.log(`[Shopify Return] Partial return detected for order ${order.shopify_order_name} (${totalRefundedQty}/${totalOrderQty} items). Moving to Admin Attention.`);

    // DO NOT mark order as returned! Keep original status (e.g. delivered / dispatched)
    if (existingReturn) {
      await supabase
        .from("returns")
        .update({
          return_type: "partial",
          return_source: "shopify_webhook",
          status: "pending_verification", // Needs Admin Attention
          is_verified: false,              // Needs Admin Approval
          refund_amount: refundTotalAmount > 0 ? refundTotalAmount : existingReturn.refund_amount,
          returned_items: returnedItemsList.length > 0 ? returnedItemsList : undefined,
          return_reason: `Shopify Partial Return: ${refundNote}`,
          updated_at: now,
        })
        .eq("id", existingReturn.id);
    } else {
      await supabase.from("returns").insert({
        order_id: order.id,
        dispatch_id: dispatch?.id || null,
        consignment_id: consignmentId,
        return_type: "partial",
        return_source: "shopify_webhook",
        order_total: totalOrderPrice,
        return_delivery_fee: 0,
        refund_amount: refundTotalAmount,
        status: "pending_verification", // Needs Admin Attention
        is_verified: false,              // Needs Admin Approval
        returned_items: returnedItemsList.length > 0 ? returnedItemsList : null,
        return_reason: `Shopify Partial Return: ${refundNote}`,
        returned_at: now,
      });
    }

    // Log the event
    const { logOrderEvent } = await import("@/lib/audit");
    await logOrderEvent(
      order.id,
      "RETURN_PENDING_APPROVAL",
      `Shopify Partial Return detected (${totalRefundedQty}/${totalOrderQty} items, ৳${refundTotalAmount}). Moved to Admin Attention section for verification.`
    );

    return {
      success: true,
      type: "partial",
      status: "pending_verification",
      message: "Partial return moved to Admin Attention section. Order status preserved.",
    };
  } else {
    // ==========================================
    // FULL RETURN HANDLING
    // ==========================================
    console.log(`[Shopify Return] Full return detected for order ${order.shopify_order_name}. Marking order and dispatch as returned.`);

    // 1. Mark Order as returned
    await supabase
      .from("orders")
      .update({
        internal_status: "returned",
        returned_at: now,
        return_reason: `Shopify Return: ${refundNote}`,
      })
      .eq("id", order.id);

    // 2. Mark Dispatch as returned
    if (dispatch) {
      await supabase
        .from("dispatches")
        .update({
          pathao_order_status: "Returned",
          updated_at: now,
        })
        .eq("id", dispatch.id);
    }

    // 3. Upsert return entry
    if (existingReturn) {
      await supabase
        .from("returns")
        .update({
          return_type: "full",
          return_source: "shopify_webhook",
          status: "received",
          is_verified: true,
          returned_at: now,
          return_reason: `Shopify Return: ${refundNote}`,
          updated_at: now,
        })
        .eq("id", existingReturn.id);
    } else {
      await supabase.from("returns").insert({
        order_id: order.id,
        dispatch_id: dispatch?.id || null,
        consignment_id: consignmentId,
        return_type: "full",
        return_source: "shopify_webhook",
        order_total: totalOrderPrice,
        return_delivery_fee: 0,
        refund_amount: refundTotalAmount || totalOrderPrice,
        status: "received",
        is_verified: true,
        returned_items: returnedItemsList.length > 0 ? returnedItemsList : null,
        return_reason: `Shopify Return: ${refundNote}`,
        returned_at: now,
      });
    }

    // Log the event
    const { logOrderEvent } = await import("@/lib/audit");
    await logOrderEvent(
      order.id,
      "RETURNED",
      `Order marked as returned via Shopify webhook (${refundNote}). Dispatches updated.`
    );

    return {
      success: true,
      type: "full",
      status: "returned",
      message: "Order and dispatch marked as returned on dispatch app.",
    };
  }
}
