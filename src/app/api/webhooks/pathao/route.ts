import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { updateShopifyFulfillmentTracking, markShopifyOrderAsDelivered, markShopifyOrderAsPartialDelivered } from "@/lib/shopify/client";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let payload: any = null;

  const supabaseAdmin = createServiceClient();

  try {
    payload = JSON.parse(rawBody);
  } catch (parseErr) {
    // Record malformed JSON attempt so it is never dropped silently
    await supabaseAdmin.from("webhook_logs").insert({
      source: "pathao",
      topic: "invalid_json",
      pathao_consignment_id: null,
      payload: { rawBody: rawBody.slice(0, 1000) },
      processed: false,
      error: "Malformed JSON received from webhook caller",
    });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract secret from various possible casing and headers
  const providedSecret = (
    request.headers.get("x-pathao-merchant-webhook-integration-secret") ||
    request.headers.get("X-Pathao-Merchant-Webhook-Integration-Secret") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();

  // Fetch stored secrets from app_settings
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("pathao_webhook_secret, pathao_client_secret")
    .single();
  const storedWebhookSecret = (settings?.pathao_webhook_secret || "").trim();
  const storedClientSecret = (settings?.pathao_client_secret || "").trim();

  // The secret we return in the response header (Pathao validates this header)
  const returnSecret = providedSecret || storedWebhookSecret || storedClientSecret || "f3992ecc-59da-4cbe-a049-a13da2018d51";

  // 1. Webhook Integration Verification Event
  if (payload.event === "webhook_integration") {
    await supabaseAdmin.from("webhook_logs").insert({
      source: "pathao",
      topic: "webhook_integration",
      pathao_consignment_id: null,
      payload,
      processed: true,
      error: null,
    });

    return new NextResponse(JSON.stringify({ success: true, message: "Webhook verified successfully" }), {
      status: 202,
      headers: {
        "Content-Type": "application/json",
        "X-Pathao-Merchant-Webhook-Integration-Secret": returnSecret,
      },
    });
  }

  // 2. Secret Verification for normal events
  // Check against webhook_secret, client_secret, or fallback UUID
  const validSecrets = [
    storedWebhookSecret,
    storedClientSecret,
    "f3992ecc-59da-4cbe-a049-a13da2018d51",
  ].filter(Boolean);

  const isAuthorized =
    validSecrets.length === 0 ||
    (providedSecret &&
      validSecrets.some(
        (sec) =>
          providedSecret === sec ||
          providedSecret.includes(sec) ||
          sec.includes(providedSecret)
      ));

  if (!isAuthorized) {
    console.error(`[Pathao Webhook] Unauthorized. Expected one of: ${validSecrets.join(", ")}, Got: ${providedSecret}`);
    await supabaseAdmin.from("webhook_logs").insert({
      source: "pathao",
      topic: payload.event || payload.order_status || "unauthorized_webhook",
      pathao_consignment_id: payload.consignment_id || null,
      payload,
      processed: false,
      error: `Unauthorized secret mismatch (Header: '${providedSecret || "None"}')`,
    });

    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "X-Pathao-Merchant-Webhook-Integration-Secret": returnSecret,
      },
    });
  }

  // 3. Log incoming valid webhook immediately
  const topic = payload.event || payload.order_status || "status_update";
  const consignmentId = payload.consignment_id || null;

  const { data: insertedLog } = await supabaseAdmin
    .from("webhook_logs")
    .insert({
      source: "pathao",
      topic,
      pathao_consignment_id: consignmentId,
      payload,
      processed: false,
      error: null,
    })
    .select("id")
    .maybeSingle();

  const logId = insertedLog?.id;

  // 4. Return HTTP 202 IMMEDIATELY to Pathao (<50ms)
  // Pathao strictly enforces a 2-second timeout window. Waiting for database queries,
  // Shopify tracking updates, and SMS sending caused delivery timeouts in Pathao's network.
  // We execute all heavy processing asynchronously in the background.
  (async () => {
    try {
      await processPathaoWebhook(payload, returnSecret, logId);
    } catch (err: any) {
      console.error("[Pathao Webhook] Background processing error:", err);
      if (logId) {
        await supabaseAdmin
          .from("webhook_logs")
          .update({ processed: false, error: err?.message || String(err) })
          .eq("id", logId);
      }
    }

    try {
      const { processAutoDeliveredOrders } = await import("@/lib/auto-deliver");
      await processAutoDeliveredOrders();
    } catch (err) {
      console.error("[Pathao Webhook] Auto Deliver processing error:", err);
    }
  })();

  return new NextResponse(JSON.stringify({ received: true, event: topic }), {
    status: 202,
    headers: {
      "Content-Type": "application/json",
      "X-Pathao-Merchant-Webhook-Integration-Secret": returnSecret,
    },
  });
}

async function processPathaoWebhook(payload: any, storedSecret: string, logId?: string) {
  const supabase = createServiceClient();
  const consignmentId = payload.consignment_id;
  const merchantOrderId = payload.merchant_order_id;

  if (!consignmentId) {
    if (logId) {
      await supabase
        .from("webhook_logs")
        .update({ processed: true, error: "No consignment_id in payload" })
        .eq("id", logId);
    }
    return;
  }

  try {
    const rawEvent = payload.event || payload.order_status || "updated";
    const newEvent = String(rawEvent);

    const isPartialDelivery = newEvent.toLowerCase().includes("partial");
    const isReturnEvent = newEvent.toLowerCase().includes("return");

    // 1. Try to find the order directly first (more reliable)
    let order: any = null;
    if (merchantOrderId) {
      const cleanOrderId = String(merchantOrderId).trim();
      const altOrderId = cleanOrderId.startsWith("#") ? cleanOrderId.slice(1) : `#${cleanOrderId}`;

      const { data } = await supabase
        .from("orders")
        .select("*, customers(name, phone)")
        .or(`shopify_order_name.eq.${cleanOrderId},shopify_order_name.eq.${altOrderId}`)
        .maybeSingle();

      if (data) order = data;
    }

    if (!order) {
      const { data } = await supabase
        .from("orders")
        .select("*, customers(name, phone)")
        .eq("pathao_consignment_id", consignmentId)
        .maybeSingle();
      if (data) order = data;
    }

    // 2. Update dispatch record if it exists
    const { data: dispatch } = await supabase
      .from("dispatches")
      .select("*")
      .eq("consignment_id", consignmentId)
      .maybeSingle();

    if (dispatch) {
      const history = (dispatch.tracking_history as any[]) || [];
      history.push({
        status: newEvent,
        timestamp: payload.updated_at || new Date().toISOString(),
        note: payload.reason || null,
      });

      const isCancelled = newEvent.toLowerCase().includes("cancel");
      let normalizedDispatchStatus = newEvent;
      if (isPartialDelivery) {
        normalizedDispatchStatus = "Partial Delivered";
      } else if (newEvent.toLowerCase().includes("paid") && isReturnEvent) {
        normalizedDispatchStatus = "Paid Return";
      } else if (newEvent.toLowerCase() === "order.delivered" || newEvent.toLowerCase() === "delivered") {
        normalizedDispatchStatus = "Delivered";
      } else if (newEvent.toLowerCase().includes("assigned-for-delivery") || newEvent.toLowerCase().includes("assigned for delivery")) {
        normalizedDispatchStatus = "Assigned for Delivery";
      }

      const dispatchUpdate: any = {
        pathao_order_status: normalizedDispatchStatus,
        tracking_history: history,
        updated_at: new Date().toISOString(),
      };
      if (isCancelled) {
        dispatchUpdate.is_cancelled = true;
        dispatchUpdate.cancelled_at = payload.updated_at || new Date().toISOString();
        dispatchUpdate.cancel_reason = payload.reason || "Cancelled by courier";
      }

      await supabase
        .from("dispatches")
        .update(dispatchUpdate)
        .eq("consignment_id", consignmentId);

      if (!order && dispatch.order_id) {
        const { data: orderFromDispatch } = await supabase
          .from("orders")
          .select("*, customers(name, phone)")
          .eq("id", dispatch.order_id)
          .maybeSingle();
        if (orderFromDispatch) order = orderFromDispatch;
      }
    }

    if (!order) {
      console.warn(`[Pathao Webhook] No order matched for consignment ${consignmentId} or merchant ID ${merchantOrderId}`);
    } else {
      // Map Pathao event to internal ERP status
      const internalStatus = mapPathaoEventToInternal(newEvent);

      // Build update payload for the order
      const orderUpdate: any = {
        pathao_delivery_status: newEvent,
        internal_status: internalStatus,
      };

      // ─── PARTIAL DELIVERY HANDLING ─────────────────────────────────────────
      if (isPartialDelivery) {
        orderUpdate.pathao_delivery_status = "Partial Delivered";
        orderUpdate.internal_status = "delivered";
        orderUpdate.delivered_at = order.delivered_at || new Date().toISOString();

        // Create return record in returns table if not already created
        const { data: existingReturn } = await supabase
          .from("returns")
          .select("id")
          .eq("order_id", order.id)
          .maybeSingle();

        if (!existingReturn) {
          await supabase.from("returns").insert({
            order_id: order.id,
            dispatch_id: dispatch?.id || null,
            consignment_id: consignmentId,
            return_type: "partial",
            return_source: "pathao_webhook",
            order_total: Number(order.total_price) || 0,
            return_delivery_fee: 0,
            status: "pending_verification",
            is_verified: false,
            return_reason: "Pathao Partial Delivery",
            returned_at: new Date().toISOString(),
          });
        }

        // Auto-sync Partial Delivery to Shopify
        try {
          await markShopifyOrderAsPartialDelivered({
            shopifyOrderId: order.shopify_order_id,
            shopifyFulfillmentId: order.shopify_fulfillment_id,
            consignmentId,
          });
        } catch (shopifyErr) {
          console.error("[Pathao Webhook] Failed to sync partial delivery to Shopify:", shopifyErr);
        }
      }
      // ─── FULL DELIVERY HANDLING ───────────────────────────────────────────
      else if (internalStatus === "delivered") {
        orderUpdate.delivered_at = order.delivered_at || new Date().toISOString();
        orderUpdate.internal_status = "delivered";
        orderUpdate.pathao_delivery_status = "Delivered";

        // Audit event in order_events
        try {
          await supabase.from("order_events").insert({
            order_id: order.id,
            event_type: "ORDER_DELIVERED",
            description: `Order delivered via Pathao Courier (Consignment: ${consignmentId})`,
            metadata: {
              source: "pathao_webhook",
              consignment_id: consignmentId,
              event: newEvent,
              delivered_at: new Date().toISOString(),
            },
          });
        } catch (eventErr) {
          console.error("[Pathao Webhook] Failed to insert audit event:", eventErr);
        }

        // Mark as Delivered on Shopify
        try {
          const shopifyRes = await markShopifyOrderAsDelivered({
            shopifyOrderId: order.shopify_order_id,
            shopifyFulfillmentId: order.shopify_fulfillment_id,
            consignmentId,
          });

          if (shopifyRes.fulfillmentId && !order.shopify_fulfillment_id) {
            orderUpdate.shopify_fulfillment_id = shopifyRes.fulfillmentId;
          }
        } catch (shopifyErr) {
          console.error("[Pathao Webhook] Failed to mark order delivered on Shopify:", shopifyErr);
        }
      }
      // ─── RETURN HANDLING ───────────────────────────────────────────────────
      else if (internalStatus === "returned") {
        orderUpdate.pathao_delivery_status = newEvent.toLowerCase().includes("paid") ? "Paid Return" : "Returned";
        orderUpdate.internal_status = "returned";
        orderUpdate.returned_at = new Date().toISOString();
        orderUpdate.return_reason = newEvent.toLowerCase().includes("paid") ? "Paid Return via Pathao" : "Returned via Pathao";
      }
      // ─── OTHER STATUSES (Ready / Assigned for Delivery / In Transit / On Hold) ─────
      else {
        if (
          newEvent.toLowerCase().includes("assigned-for-delivery") ||
          newEvent.toLowerCase().includes("assigned for delivery") ||
          newEvent.toLowerCase().includes("ready for delivery") ||
          newEvent.toLowerCase().includes("ready-for-delivery") ||
          newEvent.toLowerCase().includes("ready_for_delivery")
        ) {
          orderUpdate.pathao_delivery_status = "Ready for Delivery";
          orderUpdate.internal_status = "dispatched";
          orderUpdate.delivered_at = null;
        } else if (newEvent.toLowerCase().includes("hold") || newEvent.toLowerCase().includes("failed")) {
          orderUpdate.pathao_delivery_status = newEvent;
          orderUpdate.internal_status = "hold";
        }
      }

      // Update order internal status in database
      await supabase
        .from("orders")
        .update(orderUpdate)
        .eq("id", order.id);

      // Update Shopify fulfillment tracking if order has fulfillment
      const activeFulfillmentId = order.shopify_fulfillment_id || orderUpdate.shopify_fulfillment_id;
      if (activeFulfillmentId && !isPartialDelivery) {
        try {
          await updateShopifyFulfillmentTracking({
            fulfillmentId: activeFulfillmentId,
            trackingNumber: consignmentId,
            trackingCompany: "Pathao",
            trackingUrl: `https://merchant.pathao.com/cn-tracking/${consignmentId}`,
            notifyCustomer: false,
          });
        } catch (shopifyErr) {
          console.error("[Pathao Webhook] Shopify tracking update failed:", shopifyErr);
        }
      }

      // Handle automated SMS
      try {
        const evtLower = newEvent.toLowerCase();
        const isOutForDelivery = evtLower.includes("out_for_delivery") || evtLower.includes("out for delivery") || evtLower.includes("assigned-for-delivery") || evtLower.includes("assigned for delivery");

        if (
          internalStatus === "dispatched" ||
          internalStatus === "delivered" ||
          internalStatus === "returned" ||
          internalStatus === "on_hold" ||
          isOutForDelivery
        ) {
          const { data: appSettings } = await supabase.from("app_settings").select("*").single();
          if (appSettings?.sms_api_key) {
            const phone = order?.customer_phone || order?.customers?.phone;
            if (phone) {
              const { sendSMS } = await import("@/lib/sms");
              let template = null;
              let eventKey = internalStatus;

              if (isOutForDelivery && appSettings.sms_auto_out_for_delivery_enabled) {
                template = appSettings.sms_auto_out_for_delivery_template || "Dear {{customer_name}}, your order {{order_id}} is out for delivery today via Pathao! Please keep ৳{{total_price}} ready. Thank you!";
                eventKey = "out_for_delivery";
              } else if (internalStatus === "dispatched" && appSettings.sms_auto_dispatch_enabled) {
                template = appSettings.sms_auto_dispatch_template;
              } else if (internalStatus === "delivered" && appSettings.sms_auto_delivered_enabled) {
                template = appSettings.sms_auto_delivered_template;
              } else if (internalStatus === "returned" && appSettings.sms_auto_returned_enabled) {
                template = appSettings.sms_auto_returned_template;
              } else if (internalStatus === "on_hold" && appSettings.sms_auto_on_hold_enabled) {
                template = appSettings.sms_auto_on_hold_template;
              }

              if (template) {
                const customerName = order.customers?.name || "Customer";
                const total = order.total_price !== undefined && order.total_price !== null ? order.total_price.toString() : "0";
                let msg = template
                  .replace(/\{\{order_id\}\}/g, order.shopify_order_name || order.id)
                  .replace(/\{\{customer_name\}\}/g, customerName)
                  .replace(/\{\{tracking_url\}\}/g, `https://merchant.pathao.com/cn-tracking/${consignmentId}`)
                  .replace(/\{\{consignment_id\}\}/g, consignmentId || "")
                  .replace(/\{\{total_price\}\}/g, total);

                await sendSMS(
                  phone,
                  msg,
                  false,
                  `pathao_${eventKey}_${order.id}_${consignmentId}`,
                  {
                    orderId: order.shopify_order_id || order.id,
                    orderName: order.shopify_order_name,
                    customerName,
                    eventType: eventKey,
                  }
                );
              }
            }
          }
        }
      } catch (smsError) {
        console.error("[SMS Automation Error]", smsError);
      }
    }

    // Mark webhook as processed
    if (logId) {
      await supabase
        .from("webhook_logs")
        .update({ processed: true, error: null })
        .eq("id", logId);
    } else {
      await supabase
        .from("webhook_logs")
        .update({ processed: true, error: null })
        .eq("pathao_consignment_id", consignmentId)
        .eq("source", "pathao");
    }
  } catch (err: any) {
    console.error("[Pathao Webhook] Processing error:", err);
    if (logId) {
      await supabase
        .from("webhook_logs")
        .update({ processed: false, error: err.message })
        .eq("id", logId);
    }
  }
}

function mapPathaoEventToInternal(event: string): string {
  const evt = (event || "").toLowerCase();

  // 1. Returns and Paid Returns MUST come first so paid-return is never marked delivered
  if (evt.includes("return")) {
    return "returned";
  }

  // 2. Partial Delivery
  if (evt.includes("partial")) {
    return "delivered";
  }

  // 3. True Delivery events
  if (
    evt === "order.delivered" ||
    evt.includes("delivered") ||
    evt.includes("payment_received") ||
    evt.includes("payment invoice")
  ) {
    return "delivered";
  }

  // 4. Cancel
  if (evt.includes("cancel")) {
    return "cancelled";
  }

  // 5. Hold / Failed
  if (evt.includes("hold") || evt.includes("failed")) {
    return "hold";
  }

  // 6. In transit / assigned for delivery / pickup
  return "dispatched";
}
