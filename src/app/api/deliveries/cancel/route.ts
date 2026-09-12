import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logOrderEvent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderIds } = body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: "orderIds is required (array)" }, { status: 400 });
    }

    const supabase = createServiceClient();
    let cancelledCount = 0;
    const errors: any[] = [];

    // Process in concurrent batches of 15 for fast performance
    const BATCH_SIZE = 15;
    for (let i = 0; i < orderIds.length; i += BATCH_SIZE) {
      const batch = orderIds.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (orderId) => {
        try {
          // If order had a partial delivery return record, clean it up
          const { data: returnsList } = await supabase
            .from("returns")
            .select("id, return_type, is_verified, refund_amount")
            .eq("order_id", orderId)
            .eq("return_reason", "Partial Delivery");

          if (returnsList && returnsList.length > 0) {
            for (const ret of returnsList) {
              if (ret.is_verified && ret.refund_amount) {
                const { data: ord } = await supabase
                  .from("orders")
                  .select("total_price")
                  .eq("id", orderId)
                  .single();
                if (ord) {
                  await supabase.from("orders").update({
                    total_price: (Number(ord.total_price) || 0) + Number(ret.refund_amount)
                  }).eq("id", orderId);
                }
              }
              await supabase.from("returns").delete().eq("id", ret.id);
            }
          }

          // Determine old status: check active dispatch or consignment
          const { data: dispatch } = await supabase
            .from("dispatches")
            .select("id")
            .eq("order_id", orderId)
            .eq("is_cancelled", false)
            .maybeSingle();

          const { data: order } = await supabase
            .from("orders")
            .select("pathao_consignment_id")
            .eq("id", orderId)
            .single();

          const oldStatus = (dispatch || order?.pathao_consignment_id) ? "dispatched" : "pending";

          const { error: updateErr } = await supabase
            .from("orders")
            .update({
              internal_status: oldStatus,
              delivered_at: null,
              pathao_delivery_status: null,
            })
            .eq("id", orderId);

          if (updateErr) throw updateErr;

          if (dispatch?.id) {
            await supabase
              .from("dispatches")
              .update({
                pathao_order_status: "In Transit",
                updated_at: new Date().toISOString(),
              })
              .eq("id", dispatch.id);
          }

          await logOrderEvent(orderId, "DELIVERY_CANCELLED", `Marked as Undelivered. Moved order back to ${oldStatus}.`);
          cancelledCount++;
        } catch (err: any) {
          errors.push({ orderId, error: err.message });
        }
      }));
    }

    return NextResponse.json({
      success: true,
      processed: cancelledCount,
      failed: errors.length,
      errors
    });
  } catch (err: any) {
    console.error("POST /api/deliveries/cancel error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
