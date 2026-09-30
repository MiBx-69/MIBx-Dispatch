import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types/database";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth check
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const { status }: { status: OrderStatus } = await request.json();

  const validStatuses: OrderStatus[] = [
    "pending", "preparing", "hold", "cancelled", "dispatched", "delivered", "delayed", "returned",
  ];

  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("*, customers(name, phone)")
    .eq("id", id)
    .single();

  if (error || !order) {
    return NextResponse.json({ error: error?.message || "Order not found" }, { status: 404 });
  }

  if (status === "dispatched" && !order.pathao_consignment_id) {
    return NextResponse.json(
      { error: "Cannot manually mark as dispatched without a Pathao consignment ID. Please use the Dispatch action." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const orderUpdates: Record<string, any> = { internal_status: status };

  if (status === "delivered") {
    orderUpdates.delivered_at = order.delivered_at || now;
  } else if (status === "returned") {
    orderUpdates.returned_at = order.returned_at || now;
    if (!order.return_reason) {
      orderUpdates.return_reason = "Manually marked as returned";
    }
  } else if (status === "cancelled") {
    orderUpdates.cancel_reason = order.cancel_reason || "Cancelled by Admin";
    orderUpdates.returned_at = null;
    orderUpdates.return_reason = null;
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update(orderUpdates as any)
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { logOrderEvent } = await import("@/lib/audit");
  await logOrderEvent(id, "STATUS_CHANGE", `Internal status updated to: ${status}`);

  if (status === "cancelled") {
    await supabase.from("returns").delete().eq("order_id", id);

    await supabase
      .from("dispatches")
      .update({
        is_cancelled: true,
        cancelled_at: now,
        cancel_reason: "Order marked as cancelled in ERP",
      })
      .eq("order_id", id);
  }

  // Handle automated SMS
  try {
    if (status === "dispatched" || status === "delivered") {
      const { data: settings } = await supabase.from("app_settings").select("*").single();
      if (settings?.sms_api_key && settings?.sms_master_enabled !== false) {
        const phone = order?.customer_phone || order?.customers?.phone;
        
        if (phone) {
          const { sendSMS } = await import("@/lib/sms");
          let template = null;
          
          if (status === "dispatched" && settings.sms_auto_dispatch_enabled) {
            template = settings.sms_auto_dispatch_template;
          } else if (status === "delivered" && settings.sms_auto_delivered_enabled) {
            template = settings.sms_auto_delivered_template;
          }

          if (template) {
            const customerName = order.customers?.name || "Customer";
            const trackingUrl = order.pathao_consignment_id
              ? `https://merchant.pathao.com/cn-tracking/${order.pathao_consignment_id}`
              : "";
            const total = order.total_price !== undefined && order.total_price !== null ? order.total_price.toString() : "0";

            const msg = template
              .replace(/\{\{order_id\}\}/g, order.shopify_order_name || order.id)
              .replace(/\{\{customer_name\}\}/g, customerName)
              .replace(/\{\{tracking_url\}\}/g, trackingUrl)
              .replace(/\{\{consignment_id\}\}/g, order.pathao_consignment_id || "")
              .replace(/\{\{total_price\}\}/g, total);

            await sendSMS(
              phone,
              msg,
              false,
              `status_${order.id}_${status}`,
              {
                orderId: order.shopify_order_id || order.id,
                orderName: order.shopify_order_name,
                customerName,
                eventType: status,
              }
            );
            await logOrderEvent(id, "SMS_SENT", `Automated SMS sent: ${msg}`);
          }
        }
      }
    }
  } catch (smsError) {
    console.error("[SMS Automation Error]", smsError);
  }

  // Invalidate Redis dashboard cache
  try {
    const { deleteCachePattern } = await import("@/lib/redis");
    await deleteCachePattern("dashboard:metrics:v1:*");
  } catch (cacheErr) {
    console.error("[Status Change] Cache invalidate error:", cacheErr);
  }

  return NextResponse.json({ success: true, status });
}
