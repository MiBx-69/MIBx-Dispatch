"use server";

import { sendSMS } from "@/lib/sms";

export async function sendSMSAction(
  to: string, 
  message: string, 
  metadata?: { orderId?: string | number; orderName?: string; customerName?: string }
) {
  try {
    const result = await sendSMS(to, message, false, undefined, metadata);
    if (!result.success) {
      throw new Error(result.message || "Failed to send SMS");
    }
    return { success: true };
  } catch (error: any) {
    console.error("sendSMSAction error:", error);
    return { success: false, error: error.message };
  }
}

export async function reportFraudAction(payload: any) {
  try {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const supabase = createServiceClient();
    const { data: settings } = await supabase.from("app_settings").select("fraudspy_api_key").single();
    
    if (!settings?.fraudspy_api_key) {
      throw new Error("FraudSpy API key not configured");
    }
    
    const { submitFraudReport } = await import("@/lib/fraudspy");
    const result = await submitFraudReport(payload, settings.fraudspy_api_key);
    
    return { success: true, data: result };
  } catch (error: any) {
    console.error("reportFraudAction error:", error);
    return { success: false, error: error.message };
  }
}
