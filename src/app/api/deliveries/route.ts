import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

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
        .select("id, internal_status, total_price, pathao_consignment_id, shopify_order_name")
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

      if (isPartial) {
        // Find the dispatch record if any
        const { data: dispatch } = await supabase
          .from("dispatches")
          .select("id, consignment_id")
          .eq("order_id", orderId)
          .eq("is_cancelled", false)
          .maybeSingle();

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
            order_total: Number(order.total_price) || 0,
            return_delivery_fee: Number(return_delivery_fee) || 0,
            is_paid_return: !!is_paid_return,
            status: "pending_verification", // Partial returns need admin verification
            is_verified: false,
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

      // Mark the order as delivered
      const { error: updateErr } = await supabase.from("orders").update({
        internal_status: "delivered",
        delivered_at: now,
      }).eq("id", orderId);

      if (updateErr) {
        errors.push({ orderId, error: `Failed to update order status: ${updateErr.message}` });
        continue;
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
