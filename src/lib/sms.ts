import { createServiceClient } from "./supabase/server";

export interface SendSMSMetadata {
  orderId?: string | number | null;
  orderName?: string | null;
  customerName?: string | null;
  eventType?: string | null; // e.g. 'order', 'dispatch', 'out_for_delivery', 'delivered', 'returned', 'on_hold', 'cancelled', 'manual', 'test'
}

export async function sendSMS(
  to: string,
  msg: string,
  useWhatsapp?: boolean,
  idempotencyKey?: string,
  metadata?: SendSMSMetadata
): Promise<{ success: boolean; message?: string; requestId?: number }> {
  const supabase = createServiceClient();
  const parsedOrderId = metadata?.orderId && !isNaN(Number(metadata.orderId)) ? Number(metadata.orderId) : null;

  // Infer normalized event type (e.g. 'order', 'dispatch', 'out_for_delivery', 'delivered', etc.)
  let rawEventType = metadata?.eventType;
  if (!rawEventType && idempotencyKey) {
    const keyLower = idempotencyKey.toLowerCase();
    if (keyLower.includes("out_for_delivery")) rawEventType = "out_for_delivery";
    else if (keyLower.includes("dispatch")) rawEventType = "dispatch";
    else if (keyLower.includes("deliver")) rawEventType = "delivered";
    else if (keyLower.includes("return")) rawEventType = "returned";
    else if (keyLower.includes("hold")) rawEventType = "on_hold";
    else if (keyLower.includes("cancel")) rawEventType = "cancelled";
    else if (keyLower.includes("order")) rawEventType = "order";
    else if (keyLower.includes("test")) rawEventType = "test";
  }
  const eventType = (rawEventType || "manual").toLowerCase();

  // 1. Fetch SMS settings from app_settings
  const { data: settings } = await supabase
    .from("app_settings")
    .select(
      "sms_api_key, sms_sender_id, sms_master_enabled, sms_sender_id_enabled, sms_non_sender_id_enabled, sms_sender_id_event_types"
    )
    .single();

  // 2. Master CTA Switch: If SMS notifications are globally disabled, abort immediately
  if (settings && settings.sms_master_enabled === false) {
    console.warn("[SMS Master Switch] SMS notifications are globally paused in Settings.");
    try {
      await supabase.from("webhook_logs").insert({
        source: "sms",
        topic: "sms/master_disabled",
        shopify_order_id: parsedOrderId,
        payload: {
          to,
          msg,
          eventType,
          idempotencyKey,
          orderName: metadata?.orderName,
          reason: "Master SMS toggle is OFF in Settings",
        },
        processed: false,
        error: "Master SMS notifications are globally disabled in Settings",
      });
    } catch (dbErr) {
      console.error("[SMS Logging Error]", dbErr);
    }
    return { success: false, message: "Master SMS notifications are globally disabled in Settings" };
  }

  // 3. Robust Deduplication & Idempotency check:
  // Customers must NEVER receive repeated notifications for the same order and event!
  if (idempotencyKey) {
    // A. Check Redis lock (if Redis is available)
    try {
      const { redis } = await import("./redis");
      const key = `idempotency:sms:${idempotencyKey}`;
      const acquired = await redis.set(key, "1", { ex: 86400 * 7, nx: true });
      if (!acquired) {
        console.warn(`[SMS Idempotency] Duplicate prevented by Redis lock: ${idempotencyKey}`);
        try {
          await supabase.from("webhook_logs").insert({
            source: "sms",
            topic: "sms/duplicate_blocked",
            shopify_order_id: parsedOrderId,
            payload: {
              to,
              msg,
              eventType,
              idempotencyKey,
              orderName: metadata?.orderName,
              customerName: metadata?.customerName,
              reason: "Duplicate prevented by idempotency lock",
            },
            processed: true,
          });
        } catch (dbErr) {
          console.error("[SMS Logging Error]", dbErr);
        }
        return { success: true, message: "Duplicate SMS prevented by idempotency check" };
      }
    } catch (err) {
      console.error("[SMS Idempotency] Redis check error (falling back to database check):", err);
    }

    // B. Database check for duplicate idempotencyKey
    try {
      const { data: existingKeyLog } = await supabase
        .from("webhook_logs")
        .select("id")
        .eq("source", "sms")
        .eq("topic", "sms/sent")
        .contains("payload", { idempotencyKey })
        .limit(1)
        .maybeSingle();

      if (existingKeyLog) {
        console.warn(`[SMS Idempotency] Duplicate prevented by database log check: ${idempotencyKey}`);
        return { success: true, message: "Duplicate SMS prevented: already sent" };
      }
    } catch (dbErr) {
      console.error("[SMS Deduplication DB Check Error]", dbErr);
    }
  }

  // C. Order + Event Deduplication: Check if this specific order already received SMS for this event
  if (parsedOrderId && eventType && eventType !== "manual" && eventType !== "test") {
    try {
      const { data: existingEventSMS } = await supabase
        .from("webhook_logs")
        .select("id")
        .eq("source", "sms")
        .eq("topic", "sms/sent")
        .eq("shopify_order_id", parsedOrderId)
        .contains("payload", { eventType })
        .limit(1)
        .maybeSingle();

      if (existingEventSMS) {
        console.warn(`[SMS Deduplication] Order ${parsedOrderId} has already received SMS for '${eventType}'. Skipping.`);
        try {
          await supabase.from("webhook_logs").insert({
            source: "sms",
            topic: "sms/duplicate_blocked",
            shopify_order_id: parsedOrderId,
            payload: {
              to,
              msg,
              eventType,
              idempotencyKey,
              orderName: metadata?.orderName,
              customerName: metadata?.customerName,
              reason: `Notification for event '${eventType}' was already sent to customer`,
            },
            processed: true,
          });
        } catch (dbErr) {
          console.error("[SMS Logging Error]", dbErr);
        }
        return { success: true, message: `SMS for event '${eventType}' already sent to customer` };
      }
    } catch (dbErr) {
      console.error("[SMS Event Deduplication Error]", dbErr);
    }
  }

  // 4. Validate API key
  if (!settings?.sms_api_key) {
    console.warn("SMS API Key not configured.");
    try {
      await supabase.from("webhook_logs").insert({
        source: "sms",
        topic: "sms/not_configured",
        shopify_order_id: parsedOrderId,
        payload: { to, msg, eventType, idempotencyKey, orderName: metadata?.orderName },
        processed: false,
        error: "SMS API Key not configured in Settings",
      });
    } catch (dbErr) {
      console.error("[SMS Logging Error]", dbErr);
    }
    return { success: false, message: "SMS API Key not configured" };
  }

  // 5. Format phone number to start with 880
  let formattedPhone = to.replace(/[^0-9]/g, "");
  if (formattedPhone.startsWith("01")) {
    formattedPhone = "88" + formattedPhone;
  }
  if (!formattedPhone.startsWith("880") && formattedPhone.startsWith("1")) {
    formattedPhone = "880" + formattedPhone;
  }

  if (formattedPhone.length < 13) {
    try {
      await supabase.from("webhook_logs").insert({
        source: "sms",
        topic: "sms/invalid_phone",
        shopify_order_id: parsedOrderId,
        payload: { originalPhone: to, formattedPhone, msg, eventType, idempotencyKey, orderName: metadata?.orderName },
        processed: false,
        error: "Invalid phone number format",
      });
    } catch (dbErr) {
      console.error("[SMS Logging Error]", dbErr);
    }
    return { success: false, message: "Invalid phone number format" };
  }

  // 6. Sender ID (Masking) vs Non-Sender ID (Non-Masking) Configuration
  const isSenderIdEnabled = settings.sms_sender_id_enabled !== false;
  const isNonSenderIdEnabled = settings.sms_non_sender_id_enabled !== false;

  let allowedSenderIdTypes: string[] = [
    "order",
    "dispatch",
    "out_for_delivery",
    "delivered",
    "returned",
    "on_hold",
    "cancelled",
    "manual",
  ];

  if (settings.sms_sender_id_event_types) {
    if (typeof settings.sms_sender_id_event_types === "string") {
      allowedSenderIdTypes = settings.sms_sender_id_event_types
        .split(",")
        .map((t: string) => t.trim().toLowerCase())
        .filter(Boolean);
    } else if (Array.isArray(settings.sms_sender_id_event_types)) {
      allowedSenderIdTypes = (settings.sms_sender_id_event_types as string[]).map((t: string) => t.toLowerCase());
    }
  }

  const isTypeSelectedForSenderId = allowedSenderIdTypes.includes(eventType);
  const useSenderId = isSenderIdEnabled && Boolean(settings.sms_sender_id) && isTypeSelectedForSenderId;

  // If this message type is not using Sender ID, verify that Non-Sender ID is allowed
  if (!useSenderId && !isNonSenderIdEnabled) {
    console.warn(`[SMS Config] Message type '${eventType}' does not use Sender ID, and Non-Sender ID SMS is disabled in Settings.`);
    try {
      await supabase.from("webhook_logs").insert({
        source: "sms",
        topic: "sms/sender_id_blocked",
        shopify_order_id: parsedOrderId,
        payload: {
          to: formattedPhone,
          msg,
          eventType,
          idempotencyKey,
          orderName: metadata?.orderName,
          reason: `Sender ID is not enabled for '${eventType}' and Non-Sender ID SMS is disabled.`,
        },
        processed: false,
        error: `Non-Sender ID SMS is disabled and '${eventType}' is not selected for Sender ID`,
      });
    } catch (dbErr) {
      console.error("[SMS Logging Error]", dbErr);
    }
    return {
      success: false,
      message: `SMS cancelled: Non-Sender ID SMS is disabled and '${eventType}' is not configured for Sender ID.`,
    };
  }

  // 7. Prepare payload for SMS provider
  const formData = new URLSearchParams();
  formData.append("api_key", settings.sms_api_key);
  formData.append("msg", msg);
  formData.append("to", formattedPhone);

  if (useSenderId && settings.sms_sender_id) {
    formData.append("sender_id", settings.sms_sender_id);
  }

  try {
    const response = await fetch("https://api.sms.net.bd/sendsms", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    });

    const result = await response.json();

    if (result.error === 0) {
      try {
        await supabase.from("webhook_logs").insert({
          source: "sms",
          topic: "sms/sent",
          shopify_order_id: parsedOrderId,
          payload: {
            to: formattedPhone,
            originalPhone: to,
            msg,
            requestId: result.data?.request_id,
            idempotencyKey,
            eventType,
            isSenderId: useSenderId,
            senderId: useSenderId ? settings.sms_sender_id : null,
            orderName: metadata?.orderName,
            customerName: metadata?.customerName,
          },
          processed: true,
        });
      } catch (dbErr) {
        console.error("[SMS Logging Error]", dbErr);
      }
      return { success: true, requestId: result.data?.request_id };
    } else {
      console.error("[SMS Provider Error]", result);
      try {
        await supabase.from("webhook_logs").insert({
          source: "sms",
          topic: "sms/failed",
          shopify_order_id: parsedOrderId,
          payload: {
            to: formattedPhone,
            originalPhone: to,
            msg,
            eventType,
            idempotencyKey,
            isSenderId: useSenderId,
            senderId: useSenderId ? settings.sms_sender_id : null,
            orderName: metadata?.orderName,
            providerResponse: result,
          },
          processed: false,
          error: result.msg || "Unknown SMS error from provider",
        });
      } catch (dbErr) {
        console.error("[SMS Logging Error]", dbErr);
      }
      return { success: false, message: result.msg || "Unknown SMS error" };
    }
  } catch (err: any) {
    console.error("[SMS Error]", err);
    try {
      await supabase.from("webhook_logs").insert({
        source: "sms",
        topic: "sms/error",
        shopify_order_id: parsedOrderId,
        payload: {
          to: formattedPhone,
          originalPhone: to,
          msg,
          eventType,
          idempotencyKey,
          isSenderId: useSenderId,
          orderName: metadata?.orderName,
        },
        processed: false,
        error: err.message || "Failed to send SMS (Network Exception)",
      });
    } catch (dbErr) {
      console.error("[SMS Logging Error]", dbErr);
    }
    return { success: false, message: err.message || "Failed to send SMS" };
  }
}
