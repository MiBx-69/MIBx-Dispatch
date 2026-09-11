import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPathaoOrderStatus } from "@/lib/pathao/client";
import { sendSMS } from "@/lib/sms";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();

    // Fetch active dispatches that are not finalized
    const { data: dispatches, error } = await supabase
      .from("dispatches")
      .select(`
        id,
        consignment_id,
        pathao_order_status,
        amount_to_collect,
        delivery_fee,
        recipient_phone,
        recipient_name,
        shopify_order_name,
        orders!inner (
          id,
          internal_status,
          total_price,
          customer_phone,
          customer_name
        )
      `)
      .not("consignment_id", "is", null)
      .eq("is_cancelled", false)
      .not("pathao_order_status", "in", '("Delivered","Returned","Cancelled","order.delivered","order.returned","order.cancelled")')
      .order("dispatched_at", { ascending: false })
      .limit(50); // Batch limit to prevent timeouts

    if (error) throw error;

    const activeList = dispatches || [];
    let updatedCount = 0;
    const errors: any[] = [];

    // Check settings for SMS triggers
    const { data: settings } = await supabase.from("app_settings").select("sms_api_key, sms_sender_id").single();
    const smsEnabled = !!settings?.sms_api_key;

    for (const d of activeList) {
      if (!d.consignment_id) continue;

      try {
        const infoRes = await getPathaoOrderStatus(d.consignment_id);
        const data = infoRes?.data;
        if (!data || !data.order_status) continue;

        const currentStatus = (d.pathao_order_status || "").toLowerCase();
        const newStatus = (data.order_status || "").toLowerCase();

        if (currentStatus === newStatus) continue;

        const now = new Date().toISOString();
        const orderId = (d.orders as any)?.id;

        // 1. Delivered
        if (newStatus.includes("delivered") || newStatus.includes("payment_received")) {
          await supabase.from("dispatches").update({
            pathao_order_status: "Delivered",
            updated_at: now,
          }).eq("id", d.id);

          if (orderId) {
            await supabase.from("orders").update({
              internal_status: "delivered",
              delivered_at: now,
            }).eq("id", orderId);
          }
          updatedCount++;
        }
        // 2. Returned
        else if (newStatus.includes("return") || newStatus.includes("returned")) {
          await supabase.from("dispatches").update({
            pathao_order_status: "Returned",
            updated_at: now,
          }).eq("id", d.id);

          if (orderId) {
            await supabase.from("orders").update({
              internal_status: "returned",
              returned_at: now,
            }).eq("id", orderId);

            // Create return record if none exists
            const { data: existingReturn } = await supabase.from("returns").select("id").eq("order_id", orderId).maybeSingle();
            if (!existingReturn) {
              await supabase.from("returns").insert({
                order_id: orderId,
                dispatch_id: d.id,
                consignment_id: d.consignment_id,
                return_reason: "Returned via Pathao Auto-Sync",
                return_type: "full",
                return_source: "pathao_sync",
                order_total: Number((d.orders as any)?.total_price) || 0,
                return_delivery_fee: Number(data.delivery_fee || d.delivery_fee || 0),
                status: "received",
                is_verified: true,
                returned_at: now,
              });
            }
          }
          updatedCount++;
        }
        // 3. Out for Delivery
        else if (newStatus.includes("out_for_delivery") || newStatus.includes("out for delivery")) {
          await supabase.from("dispatches").update({
            pathao_order_status: "Out for Delivery",
            updated_at: now,
          }).eq("id", d.id);

          // Trigger out-for-delivery SMS if not already sent
          if (smsEnabled && d.recipient_phone) {
            const customerName = d.recipient_name || (d.orders as any)?.customer_name || "Customer";
            const orderName = d.shopify_order_name || "your order";
            const amount = Number(d.amount_to_collect || 0);
            const msg = `Dear ${customerName}, your MiBx order ${orderName} is out for delivery today via Pathao rider! Please keep ৳${amount} ready. Thank you!`;
            sendSMS(d.recipient_phone, msg).catch(() => {});
          }
          updatedCount++;
        }
        // 4. Cancelled
        else if (newStatus.includes("cancel") || newStatus.includes("cancelled")) {
          await supabase.from("dispatches").update({
            pathao_order_status: "Cancelled",
            is_cancelled: true,
            cancelled_at: now,
            cancel_reason: "Cancelled via Pathao Auto-Sync",
            updated_at: now,
          }).eq("id", d.id);

          if (orderId) {
            await supabase.from("orders").update({
              internal_status: "cancelled",
              cancel_reason: "Cancelled via Pathao Courier",
            }).eq("id", orderId);
          }
          updatedCount++;
        }
        // 5. In Transit / Hub / other
        else {
          await supabase.from("dispatches").update({
            pathao_order_status: data.order_status,
            updated_at: now,
          }).eq("id", d.id);
          updatedCount++;
        }
      } catch (err: any) {
        errors.push({ consignment_id: d.consignment_id, error: err.message });
      }
    }

    return NextResponse.json({
      success: true,
      totalChecked: activeList.length,
      updatedCount,
      errorsCount: errors.length,
    });
  } catch (err: any) {
    console.error("Pathao sync status error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
