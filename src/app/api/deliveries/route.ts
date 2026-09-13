import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { markShopifyOrderAsDelivered, markShopifyOrderAsPartialDelivered } from "@/lib/shopify/client";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      orderIds,
      delivery_type = "full",
      notes,
      return_reason,
      is_paid_return,
      return_delivery_fee = 0,
      returned_items = null,
    } = body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: "Missing orderIds" }, { status: 400 });
    }

    const supabase = createServiceClient();
    let processedCount = 0;
    const errors: any[] = [];

    for (const orderId of orderIds) {
      // Fetch the order
      const { data: order, error: fetchErr } = await supabase
        .from("orders")
        .select("id, internal_status, pathao_delivery_status, total_price, pathao_consignment_id, shopify_order_id, shopify_fulfillment_id, shopify_order_name, line_items")
        .eq("id", orderId)
        .single();

      if (fetchErr || !order) {
        errors.push({ orderId, error: "Order not found" });
        continue;
      }

      // Check if already delivered
      if (order.internal_status === "delivered") {
        errors.push({ orderId, error: "Order is already marked as delivered" });
        continue;
      }

      const now = new Date().toISOString();
      const isPartial = delivery_type === "partial";

      // Find the dispatch record if any
      const { data: dispatch } = await supabase
        .from("dispatches")
        .select("id, consignment_id")
        .eq("order_id", orderId)
        .eq("is_cancelled", false)
        .maybeSingle();

      let returnedItemsValue = 0;
      let updatedLineItems = order.line_items;

      if (isPartial) {
        // Calculate returned items value
        returnedItemsValue = Number(body.returned_items_value) || 
          (Array.isArray(returned_items) ? returned_items.reduce((sum: number, item: any) => sum + (Number(item.price || 0) * Number(item.quantity || 1)), 0) : 0);

        if (Array.isArray(order.line_items) && Array.isArray(returned_items)) {
          updatedLineItems = order.line_items.map((item: any, idx: number) => {
            const matchedReturn = returned_items.find((r: any) => 
              (r.id && (String(r.id) === String(item.id) || String(r.id) === String(item.variant_id) || String(r.id) === String(idx))) ||
              (r.name && (r.name === item.title || r.name === item.name))
            );
            if (!matchedReturn) return item;
            const currentQty = typeof item.quantity === "number" ? item.quantity : (Number(item.quantity) || 1);
            const retQty = Number(matchedReturn.quantity) || 0;
            return {
              ...item,
              original_quantity: item.original_quantity !== undefined ? item.original_quantity : currentQty,
              quantity: Math.max(0, currentQty - retQty),
            };
          });
        }

        // Check if a return record already exists
        const { data: existingReturn } = await supabase
          .from("returns")
          .select("id")
          .eq("order_id", orderId)
          .maybeSingle();

        if (!existingReturn) {
          // Create return record for the rejected items
          const { error: insertErr } = await supabase.from("returns").insert({
            order_id: orderId,
            dispatch_id: dispatch?.id || null,
            consignment_id: dispatch?.consignment_id || order.pathao_consignment_id || null,
            return_reason: return_reason || "Partial Delivery",
            return_type: "partial",
            return_source: "manual",
            order_total: returnedItemsValue > 0 ? returnedItemsValue : Number(order.total_price) || 0,
            refund_amount: returnedItemsValue,
            return_delivery_fee: Number(return_delivery_fee) || 0,
            is_paid_return: !!is_paid_return,
            status: "received",
            is_verified: true,
            returned_items: returned_items,
            notes: notes || null,
            returned_at: now,
          });

          if (insertErr) {
            errors.push({ orderId, error: `Failed to create return record: ${insertErr.message}` });
            continue;
          }
        }
      }

      // Update dispatch record if exists
      if (dispatch?.id) {
        await supabase.from("dispatches").update({
          pathao_order_status: isPartial ? "Partial Delivered" : "Delivered",
          updated_at: now,
        }).eq("id", dispatch.id);
      }

      // Mark the order as delivered and adjust total_price for partial delivery
      const orderUpdates: any = {
        internal_status: "delivered",
        pathao_delivery_status: isPartial ? "Partial Delivered" : "Delivered",
        delivered_at: now,
      };

      if (isPartial && returnedItemsValue > 0) {
        const currentTotal = Number(order.total_price) || 0;
        orderUpdates.total_price = Math.max(0, currentTotal - returnedItemsValue);
        orderUpdates.line_items = updatedLineItems;
      }

      const { error: updateErr } = await supabase.from("orders").update(orderUpdates).eq("id", orderId);

      if (updateErr) {
        errors.push({ orderId, error: `Failed to update order status: ${updateErr.message}` });
        continue;
      }

      // Auto-sync with Shopify
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
