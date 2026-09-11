import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logOrderEvent } from "@/lib/audit";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderIds, returnIds } = body;

    const supabase = createServiceClient();
    let targetOrderIds: string[] = [];

    if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
      targetOrderIds = orderIds;
    } else if (returnIds && Array.isArray(returnIds) && returnIds.length > 0) {
      // Chunk returnIds in batches of 100 to avoid PostgREST query param size limits
      const allOrderIds: string[] = [];
      for (let i = 0; i < returnIds.length; i += 100) {
        const chunk = returnIds.slice(i, i + 100);
        const { data: rets } = await supabase
          .from("returns")
          .select("order_id")
          .in("id", chunk);
        if (rets) {
          allOrderIds.push(...rets.map((r: any) => r.order_id).filter(Boolean));
        }
      }
      targetOrderIds = Array.from(new Set(allOrderIds));
    }

    if (targetOrderIds.length === 0) {
      return NextResponse.json({ error: "orderIds or returnIds is required (array)" }, { status: 400 });
    }

    let cancelledCount = 0;
    const errors: any[] = [];

    // Process orders in concurrent batches of 15 for fast performance with unlimited selections
    const BATCH_SIZE = 15;
    for (let i = 0; i < targetOrderIds.length; i += BATCH_SIZE) {
      const batch = targetOrderIds.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async (orderId) => {
        try {
          // Fetch return records for this order
          const { data: returnsList } = await supabase
            .from("returns")
            .select("id, return_type, is_verified, refund_amount")
            .eq("order_id", orderId);

          if (returnsList && returnsList.length > 0) {
            for (const ret of returnsList) {
              if (ret.return_type === "partial" && ret.is_verified && ret.refund_amount) {
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
            .select("pathao_consignment_id, cancel_reason")
            .eq("id", orderId)
            .single();

          const oldStatus = order?.cancel_reason
            ? "cancelled"
            : (dispatch || order?.pathao_consignment_id) ? "dispatched" : "pending";

          const { error: updateErr } = await supabase
            .from("orders")
            .update({
              internal_status: oldStatus,
              returned_at: null,
              return_reason: null,
              return_delivery_fee: 0,
              delivered_at: null,
              pathao_delivery_status: null,
            })
            .eq("id", orderId);

          if (updateErr) throw updateErr;

          await logOrderEvent(orderId, "STATUS_CHANGE", `Marked as Not Delivered / Not Returned. Moved order back to ${oldStatus}.`);
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
    console.error("POST /api/returns/cancel error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
