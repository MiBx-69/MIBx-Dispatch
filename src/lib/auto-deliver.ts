import { createServiceClient } from "@/lib/supabase/server";

export async function processAutoDeliveredOrders() {
  try {
    const supabase = createServiceClient();
    
    // 1. Fetch settings
    const { data: settings } = await supabase.from("app_settings").select("*").single();
    if (!settings || !settings.auto_mark_delivered_days || settings.auto_mark_delivered_days <= 0) {
      return; // Feature disabled
    }

    const days = settings.auto_mark_delivered_days;

    // 2. Calculate the cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffISO = cutoffDate.toISOString();

    // 3. Find dispatched or hold orders that have a dispatch record older than cutoffDate
    // First, find active dispatches older than cutoff
    const { data: oldDispatches, error: dispatchErr } = await supabase
      .from("dispatches")
      .select("order_id, consignment_id")
      .lt("dispatched_at", cutoffISO)
      .eq("is_cancelled", false);

    if (dispatchErr) {
      console.error("[Auto-Deliver] Error fetching old dispatches:", dispatchErr);
      return;
    }

    if (!oldDispatches || oldDispatches.length === 0) return;

    const orderIdsToCheck = oldDispatches.map(d => d.order_id);

    // Filter orders to only those that are currently "dispatched" or "hold"
    const { data: ordersToUpdate, error: orderErr } = await supabase
      .from("orders")
      .select("id, shopify_order_name, customer_phone, customers(name, phone)")
      .in("id", orderIdsToCheck)
      .in("internal_status", ["dispatched", "hold"]);

    if (orderErr) {
      console.error("[Auto-Deliver] Error fetching orders to update:", orderErr);
      return;
    }

    if (!ordersToUpdate || ordersToUpdate.length === 0) return;

    console.log(`[Auto-Deliver] Found ${ordersToUpdate.length} orders to mark as delivered automatically.`);

    // 4. Mark them as delivered
    const orderIds = ordersToUpdate.map(o => o.id);
    const now = new Date().toISOString();

    await supabase
      .from("orders")
      .update({
        internal_status: "delivered",
        pathao_delivery_status: "auto_delivered", // Distinguish from actual webhook
        updated_at: now
      })
      .in("id", orderIds);

    // 5. Send automated SMS if enabled
    if (settings.sms_api_key && settings.sms_auto_delivered_enabled && settings.sms_auto_delivered_template) {
      const { sendSMS } = await import("@/lib/sms");
      
      for (const order of ordersToUpdate) {
        const phone = order.customer_phone || (order.customers as any)?.phone;
        if (phone) {
          try {
            const msg = settings.sms_auto_delivered_template
              .replace("{{order_id}}", order.shopify_order_name || order.id)
              .replace("{{customer_name}}", (order.customers as any)?.name || "Customer");
            
            await sendSMS(phone, msg);
          } catch (smsErr) {
            console.error(`[Auto-Deliver SMS] Error for order ${order.id}:`, smsErr);
          }
        }
      }
    }

  } catch (error) {
    console.error("[Auto-Deliver] Unhandled exception:", error);
  }
}
