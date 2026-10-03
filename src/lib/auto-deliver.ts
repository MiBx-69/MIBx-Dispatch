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
    // First, find active dispatches older than cutoff, excluding returns, failures, and cancellations
    const { data: oldDispatches, error: dispatchErr } = await supabase
      .from("dispatches")
      .select("order_id, consignment_id, pathao_order_status")
      .lt("dispatched_at", cutoffISO)
      .eq("is_cancelled", false);

    if (dispatchErr) {
      console.error("[Auto-Deliver] Error fetching old dispatches:", dispatchErr);
      return;
    }

    if (!oldDispatches || oldDispatches.length === 0) return;

    // Filter out any dispatches with courier returns, failed pickups, or cancellations
    const eligibleDispatches = oldDispatches.filter((d: any) => {
      const st = (d.pathao_order_status || "").toLowerCase();
      if (st.includes("return") || st.includes("fail") || st.includes("cancel")) return false;
      return true;
    });

    if (eligibleDispatches.length === 0) return;

    const orderIdsToCheck = Array.from(new Set(eligibleDispatches.map((d: any) => d.order_id)));

    // Filter orders to only those that are currently "dispatched" or "hold"
    // and whose courier status does not indicate return or failure
    const { data: ordersToUpdate, error: orderErr } = await supabase
      .from("orders")
      .select("id, shopify_order_name, customer_phone, pathao_delivery_status, customers(name, phone)")
      .in("id", orderIdsToCheck)
      .in("internal_status", ["dispatched", "hold"]);

    if (orderErr) {
      console.error("[Auto-Deliver] Error fetching orders to update:", orderErr);
      return;
    }

    const filteredOrdersToUpdate = (ordersToUpdate || []).filter((o: any) => {
      const pst = (o.pathao_delivery_status || "").toLowerCase();
      if (pst.includes("return") || pst.includes("fail") || pst.includes("cancel")) return false;
      return true;
    });

    if (filteredOrdersToUpdate.length === 0) return;

    console.log(`[Auto-Deliver] Found ${filteredOrdersToUpdate.length} orders to mark as delivered automatically.`);

    // 4. Mark them as delivered
    const orderIds = filteredOrdersToUpdate.map((o: any) => o.id);
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
    if (
      settings.sms_api_key &&
      settings.sms_master_enabled !== false &&
      settings.sms_auto_delivered_enabled &&
      settings.sms_auto_delivered_template
    ) {
      const { sendSMS } = await import("@/lib/sms");
      
      for (const order of ordersToUpdate) {
        const phone = order.customer_phone || (order.customers as any)?.phone;
        if (phone) {
          try {
            const msg = settings.sms_auto_delivered_template
              .replace("{{order_id}}", order.shopify_order_name || order.id)
              .replace("{{customer_name}}", (order.customers as any)?.name || "Customer");
            
            await sendSMS(
              phone,
              msg,
              false,
              `order_delivered_${order.id}`,
              {
                orderId: order.id,
                orderName: order.shopify_order_name,
                customerName: (order.customers as any)?.name,
                eventType: "delivered",
              }
            );
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
