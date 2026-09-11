import { createServiceClient } from "./supabase/server";

export async function sendSMS(
  to: string,
  msg: string,
  useWhatsapp?: boolean,
  idempotencyKey?: string
): Promise<{ success: boolean; message?: string; requestId?: number }> {
  if (idempotencyKey) {
    try {
      const { redis } = await import("./redis");
      const key = `idempotency:sms:${idempotencyKey}`;
      // Atomically set key with 7-day TTL if not exists (NX: true)
      const acquired = await redis.set(key, "1", { ex: 86400 * 7, nx: true });
      if (!acquired) {
        console.warn(`[SMS Idempotency] Duplicate SMS prevented for key: ${idempotencyKey}`);
        const supabase = createServiceClient();
        supabase.from("webhook_logs").insert({
          source: "sms",
          topic: "sms/duplicate_blocked",
          payload: { to, idempotencyKey, reason: "Duplicate prevented by idempotency lock" },
          processed: true,
        }).then(() => {}).catch(() => {});
        return { success: true, message: "Duplicate SMS prevented by idempotency check" };
      }
    } catch (err) {
      console.error("[SMS Idempotency] Redis check error:", err);
    }
  }

  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("sms_api_key, sms_sender_id").single();

  if (!settings?.sms_api_key) {
    console.warn("SMS API Key not configured.");
    return { success: false, message: "SMS API Key not configured" };
  }

  // Format phone number to start with 880
  let formattedPhone = to.replace(/[^0-9]/g, "");
  if (formattedPhone.startsWith("01")) {
    formattedPhone = "88" + formattedPhone;
  }
  if (!formattedPhone.startsWith("880") && formattedPhone.startsWith("1")) {
    formattedPhone = "880" + formattedPhone;
  }
  
  if (formattedPhone.length < 13) {
    supabase.from("webhook_logs").insert({
      source: "sms",
      topic: "sms/invalid_phone",
      payload: { originalPhone: to, formattedPhone, msg, idempotencyKey },
      processed: false,
      error: "Invalid phone number format",
    }).then(() => {}).catch(() => {});
    return { success: false, message: "Invalid phone number format" };
  }

  const formData = new URLSearchParams();
  formData.append("api_key", settings.sms_api_key);
  formData.append("msg", msg);
  formData.append("to", formattedPhone);

  if (settings.sms_sender_id) {
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
      supabase.from("webhook_logs").insert({
        source: "sms",
        topic: "sms/sent",
        payload: { to: formattedPhone, msg, requestId: result.data?.request_id, idempotencyKey },
        processed: true,
      }).then(() => {}).catch(() => {});
      return { success: true, requestId: result.data?.request_id };
    } else {
      console.error("[SMS Provider Error]", result);
      supabase.from("webhook_logs").insert({
        source: "sms",
        topic: "sms/failed",
        payload: { to: formattedPhone, msg, idempotencyKey, providerResponse: result },
        processed: false,
        error: result.msg || "Unknown SMS error",
      }).then(() => {}).catch(() => {});
      return { success: false, message: result.msg || "Unknown SMS error" };
    }
  } catch (err: any) {
    console.error("[SMS Error]", err);
    supabase.from("webhook_logs").insert({
      source: "sms",
      topic: "sms/error",
      payload: { to: formattedPhone, msg, idempotencyKey },
      processed: false,
      error: err.message || "Failed to send SMS",
    }).then(() => {}).catch(() => {});
    return { success: false, message: err.message || "Failed to send SMS" };
  }
}
