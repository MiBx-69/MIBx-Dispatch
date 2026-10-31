import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { markShopifyOrderAsDelivered, markShopifyOrderAsPartialDelivered } from "@/lib/shopify/client";
import { logOrderEvent } from "@/lib/audit";

// POST /api/deliveries — Manually mark order(s) as Delivered or Partial Delivered
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      orderIds,
      delivery_type = "full", // "full" | "partial"
      return_reason = "Customer refused",
      return_delivery_fee = 0,
      is_paid_return = false,
      notes,
      returned_items = null,
    } = body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: "orderIds is required (array)" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const errors: any[] = [];
    let processedCount = 0;

    for (const orderId of orderIds) {
      const { data: order, error: fetchErr } = await supabase
        .from("orders")
        .select(
          "id, internal_status, pathao_delivery_status, total_price, original_total_price, subtotal_price, original_subtotal_price, pathao_consignment_id, shopify_order_id, shopify_fulfillment_id, shopify_order_name, line_items"
        )
        .eq("id", orderId)
        .single();

      if (fetchErr || !order) {
        errors.push({ orderId, error: "Order not found" });
        continue;
      }

      if (order.internal_status === "delivered" && delivery_type === "full") {
        errors.push({ orderId, error: "Order is already marked as delivered" });
        continue;
      }

      const now = new Date().toISOString();
      const isPartial = delivery_type === "partial";
      const origTotal = Number((order as any).original_total_price ?? order.total_price ?? 0);

      const { data: dispatch } = await supabase
        .from("dispatches")
        .select("id, consignment_id, amount_to_collect, delivery_fee")
        .eq("order_id", orderId)
        .eq("is_cancelled", false)
        .maybeSingle();

      let returnedItemsValue = 0;

      if (isPartial) {
        returnedItemsValue =
          Number(body.returned_items_value) ||
          (Array.isArray(returned_items)
            ? returned_items.reduce(
                (sum: number, item: any) =>
                  sum + Number(item.price || 0) * Number(item.return_quantity ?? item.quantity ?? 1),
                0
              )
            : 0);

        const orderItems = Array.isArray(order.line_items) ? order.line_items : [];
        const originalOrderQty = Math.max(
          1,
          orderItems.reduce((acc: number, item: any) => acc + Number(item?.original_quantity ?? item?.quantity ?? 1), 0)
        );
        const returnedQty = Array.isArray(returned_items)
          ? Math.max(
              1,
              returned_items.reduce(
                (sum: number, item: any) => sum + Number(item.return_quantity ?? item.quantity ?? 1),
                0
              )
            )
          : 1;

        const { data: existingReturn } = await supabase
          .from("returns")
          .select("id")
          .eq("order_id", orderId)
          .maybeSingle();

        const effectiveFee = is_paid_return ? 0 : Number(return_delivery_fee) || 0;

        if (!existingReturn) {
          const { error: insertErr } = await supabase.from("returns").insert({
            order_id: orderId,
            dispatch_id: dispatch?.id || null,
            consignment_id: dispatch?.consignment_id || order.pathao_consignment_id || null,
            return_reason: return_reason || "Partial Delivery",
            return_type: "partial",
            return_source: "manual",
            order_total: origTotal,
            returned_product_value: returnedItemsValue,
            refund_amount: returnedItemsValue,
            original_order_quantity: originalOrderQty,
            returned_quantity: returnedQty,
            return_delivery_fee: effectiveFee,
            is_paid_return: !!is_paid_return,
            status: "received",
            is_verified: true,
            verification_status: "verified",
            returned_items: returned_items,
            notes: notes || null,
            returned_at: now,
            processed_at: now,
          });

          if (insertErr) {
            errors.push({ orderId, error: `Failed to create return record: ${insertErr.message}` });
            continue;
          }
        }
      }

      if (dispatch?.id) {
        const expectedCod = Number(dispatch.amount_to_collect ?? origTotal);
        const collectedCod = Math.max(0, expectedCod - (isPartial ? returnedItemsValue : 0));
        const fee = Number(dispatch.delivery_fee || 0);
        await supabase
          .from("dispatches")
          .update({
            pathao_order_status: isPartial ? "Partial Delivered" : "Delivered",
            actual_cod_collected: collectedCod,
            settlement_amount: Math.max(0, collectedCod - fee),
            updated_at: now,
          })
          .eq("id", dispatch.id);
      }

      // Mark the order as delivered WITHOUT destructively mutating total_price or line_items!
      const orderUpdates: any = {
        internal_status: "delivered",
        pathao_delivery_status: isPartial ? "Partial Delivered" : "Delivered",
        delivered_at: now,
      };

      const { error: updateErr } = await supabase.from("orders").update(orderUpdates).eq("id", orderId);

      if (updateErr) {
        errors.push({ orderId, error: `Failed to update order status: ${updateErr.message}` });
        continue;
      }

      await logOrderEvent(
        orderId,
        isPartial ? "PARTIAL_DELIVERY_RECORDED" : "ORDER_DELIVERED",
        isPartial
          ? `Order partially delivered (Returned item value: BDT ${returnedItemsValue})`
          : "Order marked as delivered manually",
        { delivery_type, returnedItemsValue }
      ).catch(() => {});

      try {
        if (order.shopify_order_id) {
          const consignmentId = dispatch?.consignment_id || order.pathao_consignment_id;
          if (isPartial) {
            await markShopifyOrderAsPartialDelivered({
              shopifyOrderId: order.shopify_order_id,
              shopifyFulfillmentId: order.shopify_fulfillment_id,
              consignmentId,
            });
          } else {
            await markShopifyOrderAsDelivered({
              shopifyOrderId: order.shopify_order_id,
              shopifyFulfillmentId: order.shopify_fulfillment_id,
              consignmentId,
            });
          }
        }
      } catch (shopifyErr) {
        console.error("[Manual Delivery] Failed to sync status with Shopify:", shopifyErr);
      }

      processedCount++;
    }

    return NextResponse.json({
      success: true,
      processed: processedCount,
      failed: errors.length,
      errors,
    });
  } catch (err: any) {
    console.error("POST /api/deliveries error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
