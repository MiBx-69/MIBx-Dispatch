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
