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

    const BATCH_SIZE = 15;
    for (let i = 0; i < targetOrderIds.length; i += BATCH_SIZE) {
      const batch = targetOrderIds.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (orderId) => {
          try {
            const { data: returnsList } = await supabase
              .from("returns")
              .select("id, return_type, is_verified, refund_amount")
              .eq("order_id", orderId);

            const { data: order } = await supabase
              .from("orders")
              .select("internal_status, total_price, original_total_price, line_items, pathao_consignment_id, cancel_reason")
              .eq("id", orderId)
              .single();

            const hadOnlyPartialReturn =
              returnsList &&
              returnsList.length > 0 &&
              returnsList.every((r: any) => r.return_type === "partial");

            if (returnsList && returnsList.length > 0) {
              for (const ret of returnsList) {
                await supabase.from("returns").delete().eq("id", ret.id);
              }
            }

            const { data: dispatch } = await supabase
              .from("dispatches")
              .select("id")
              .eq("order_id", orderId)
              .eq("is_cancelled", false)
              .maybeSingle();

            let restoredItems = order?.line_items;
            if (Array.isArray(order?.line_items)) {
              restoredItems = order.line_items.map((item: any) =>
                item && item.original_quantity != null
                  ? { ...item, quantity: item.original_quantity }
                  : item
              );
            }
            const origTotal = Number((order as any)?.original_total_price ?? order?.total_price ?? 0);

            if (hadOnlyPartialReturn && order?.internal_status === "delivered") {
              // Keep the order delivered if only a partial return was cancelled!
              await supabase
                .from("orders")
                .update({
                  total_price: origTotal,
                  line_items: restoredItems,
                  pathao_delivery_status: "Delivered",
                  return_delivery_fee: 0,
                })
                .eq("id", orderId);

              if (dispatch?.id) {
                await supabase
                  .from("dispatches")
                  .update({
                    pathao_order_status: "Delivered",
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", dispatch.id);
              }
              await logOrderEvent(orderId, "STATUS_CHANGE", "Cancelled partial return; order remains Delivered.");
            } else {
              const oldStatus = order?.cancel_reason
                ? "cancelled"
                : dispatch || order?.pathao_consignment_id
                  ? "dispatched"
                  : "pending";

              const { error: updateErr } = await supabase
                .from("orders")
                .update({
                  internal_status: oldStatus,
                  total_price: origTotal,
                  line_items: restoredItems,
                  returned_at: null,
                  return_reason: null,
                  return_delivery_fee: 0,
                  delivered_at: null,
                  pathao_delivery_status: oldStatus === "dispatched" ? "In Transit" : null,
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
              await logOrderEvent(orderId, "STATUS_CHANGE", `Marked as Unreturned. Moved order back to ${oldStatus}.`);
            }

            cancelledCount++;
          } catch (err: any) {
            errors.push({ orderId, error: err.message });
          }
        })
      );
    }

    return NextResponse.json({
      success: true,
      processed: cancelledCount,
      failed: errors.length,
      errors,
    });
  } catch (err: any) {
    console.error("POST /api/returns/cancel error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
