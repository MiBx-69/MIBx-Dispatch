"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateFraudSettings(formData: FormData) {
  const fraud_check_enabled = formData.get("fraud_check_enabled") === "true";
  const fraudspy_api_key = formData.get("fraudspy_api_key") as string;

  const supabase = createServiceClient();
  const { data: currentSettings } = await supabase.from("app_settings").select("id").single();

  try {
    if (currentSettings?.id) {
      const { error } = await supabase
        .from("app_settings")
        .update({
          fraud_check_enabled,
          fraudspy_api_key
        })
        .eq("id", currentSettings.id);
      
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("app_settings")
        .insert({
          fraud_check_enabled,
          fraudspy_api_key
        });
        
      if (error) throw error;
    }

    revalidatePath("/settings");
    revalidatePath("/settings/fraud");
  } catch (error: any) {
    console.error("Failed to update fraud settings:", error);
    throw new Error(error.message || "Failed to update fraud settings");
  }
}

export async function connectSteadfastAction(formData: FormData) {
  const api_key = formData.get("steadfast_api_key") as string;
  const secret_key = formData.get("steadfast_secret_key") as string;

  if (!api_key || !secret_key) {
    throw new Error("API Key and Secret Key are required");
  }

  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("fraudspy_api_key").single();

  if (!settings?.fraudspy_api_key) {
    throw new Error("FraudSpy API key must be configured first");
  }

  try {
    const { connectSteadfast } = await import("@/lib/fraudspy");
    const result = await connectSteadfast(api_key, secret_key, settings.fraudspy_api_key);
    return { success: true, message: result.message || "Connected successfully" };
  } catch (error: any) {
    console.error("connectSteadfastAction error:", error);
    return { success: false, error: error.message };
  }
}
