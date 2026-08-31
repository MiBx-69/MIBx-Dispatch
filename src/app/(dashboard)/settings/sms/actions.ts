"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateSMSSettings(formData: FormData) {
  const sms_api_key = formData.get("sms_api_key") as string;
  const sms_sender_id = formData.get("sms_sender_id") as string;
  const sms_auto_dispatch_enabled = formData.get("sms_auto_dispatch_enabled") === "true";
  const sms_auto_dispatch_template = formData.get("sms_auto_dispatch_template") as string;
  const sms_auto_delivered_enabled = formData.get("sms_auto_delivered_enabled") === "true";
  const sms_auto_delivered_template = formData.get("sms_auto_delivered_template") as string;
  const sms_auto_order_enabled = formData.get("sms_auto_order_enabled") === "true";
  const sms_auto_order_template = formData.get("sms_auto_order_template") as string;
  const sms_auto_cancelled_enabled = formData.get("sms_auto_cancelled_enabled") === "true";
  const sms_auto_cancelled_template = formData.get("sms_auto_cancelled_template") as string;

  const supabase = createServiceClient();
  const { data: currentSettings } = await supabase.from("app_settings").select("id").single();

  if (currentSettings?.id) {
    const { error } = await supabase
      .from("app_settings")
      .update({
        sms_api_key: sms_api_key || null,
        sms_sender_id: sms_sender_id || null,
        sms_auto_dispatch_enabled,
        sms_auto_dispatch_template,
        sms_auto_delivered_enabled,
        sms_auto_delivered_template,
        sms_auto_order_enabled,
        sms_auto_order_template,
        sms_auto_cancelled_enabled,
        sms_auto_cancelled_template
      })
      .eq("id", currentSettings.id);
    
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("app_settings")
      .insert({
        system_name: "MiBx Dispatch",
        sms_api_key: sms_api_key || null,
        sms_sender_id: sms_sender_id || null,
        sms_auto_dispatch_enabled,
        sms_auto_dispatch_template,
        sms_auto_delivered_enabled,
        sms_auto_delivered_template,
        sms_auto_order_enabled,
        sms_auto_order_template,
        sms_auto_cancelled_enabled,
        sms_auto_cancelled_template
      });
      
    if (error) throw error;
  }

  revalidatePath("/settings");
  revalidatePath("/settings/sms");
}
