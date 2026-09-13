import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/types/database";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
    .update({ internal_status: status })
    .eq("id", id)
    .select("*, customers(name, phone)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { logOrderEvent } = await import("@/lib/audit");
  await logOrderEvent(id, "STATUS_CHANGE", `Internal status updated to: ${status}`);

  if (status === "cancelled") {
    await supabase
      .from("orders")
      .update({
        cancel_reason: order.cancel_reason || "Cancelled by Admin",
        returned_at: null,
        return_reason: null,
      })
      .eq("id", id);

    await supabase.from("returns").delete().eq("order_id", id);

    await supabase
      .from("dispatches")
      .update({
        is_cancelled: true,
        cancelled_at: new Date().toISOString(),
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
            let msg = template
              .replace("{{order_id}}", order.shopify_order_name || order.id)
              .replace("{{customer_name}}", order.customers?.name || "Customer");
              
            if (order.pathao_consignment_id) {
               msg = msg.replace("{{tracking_url}}", `https://merchant.pathao.com/cn-tracking/${order.pathao_consignment_id}`);
            } else {
               msg = msg.replace("{{tracking_url}}", "");
            }
            
            if (order.total_price !== undefined && order.total_price !== null) {
              msg = msg.replace("{{total_price}}", order.total_price.toString());
            } else {
              msg = msg.replace("{{total_price}}", "0");
            }

            await sendSMS(
              phone,
              msg,
              false,
              `status_${order.id}_${status}`,
              {
                orderId: order.shopify_order_id || order.id,
                orderName: order.shopify_order_name,
                customerName: order.customers?.name,
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

  return NextResponse.json({ success: true, status });
}
