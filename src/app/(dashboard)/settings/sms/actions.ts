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
  const sms_auto_out_for_delivery_enabled = formData.get("sms_auto_out_for_delivery_enabled") === "true";
  const sms_auto_out_for_delivery_template = formData.get("sms_auto_out_for_delivery_template") as string;
  const sms_auto_returned_enabled = formData.get("sms_auto_returned_enabled") === "true";
  const sms_auto_returned_template = formData.get("sms_auto_returned_template") as string;
  const sms_auto_on_hold_enabled = formData.get("sms_auto_on_hold_enabled") === "true";
  const sms_auto_on_hold_template = formData.get("sms_auto_on_hold_template") as string;
  const sms_master_enabled = formData.get("sms_master_enabled") === "true";
  const sms_sender_id_enabled = formData.get("sms_sender_id_enabled") === "true";
  const sms_non_sender_id_enabled = formData.get("sms_non_sender_id_enabled") === "true";
  const sms_sender_id_event_types = (formData.get("sms_sender_id_event_types") as string) || "order,dispatch,out_for_delivery,delivered,returned,on_hold,cancelled,manual";

  const supabase = createServiceClient();
  const { data: currentSettings } = await supabase.from("app_settings").select("id").single();

  const payload = {
    sms_api_key: sms_api_key || null,
    sms_sender_id: sms_sender_id || null,
    sms_master_enabled,
    sms_sender_id_enabled,
    sms_non_sender_id_enabled,
    sms_sender_id_event_types,
    sms_auto_order_enabled,
    sms_auto_order_template,
    sms_auto_dispatch_enabled,
    sms_auto_dispatch_template,
    sms_auto_out_for_delivery_enabled,
    sms_auto_out_for_delivery_template,
    sms_auto_delivered_enabled,
    sms_auto_delivered_template,
    sms_auto_returned_enabled,
    sms_auto_returned_template,
    sms_auto_on_hold_enabled,
    sms_auto_on_hold_template,
    sms_auto_cancelled_enabled,
    sms_auto_cancelled_template,
  };

  if (currentSettings?.id) {
    const { error } = await supabase
      .from("app_settings")
      .update(payload)
      .eq("id", currentSettings.id);
    
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("app_settings")
      .insert({
        system_name: "MiBx Dispatch",
        ...payload,
      });
      
    if (error) throw error;
  }

  revalidatePath("/settings");
  revalidatePath("/settings/sms");
}

export async function toggleMasterSMSAction(enabled: boolean) {
  const supabase = createServiceClient();
  const { data: currentSettings } = await supabase.from("app_settings").select("id").single();
  
  if (currentSettings?.id) {
    const { error } = await supabase
      .from("app_settings")
      .update({ sms_master_enabled: enabled })
      .eq("id", currentSettings.id);
      
    if (error) throw error;
  }
  
  revalidatePath("/settings");
  revalidatePath("/settings/sms");
  return { success: true, enabled };
}

export async function toggleSettingFieldAction(field: string, value: boolean | string) {
  const allowedFields = new Set([
    "sms_master_enabled",
    "sms_sender_id_enabled",
    "sms_non_sender_id_enabled",
    "sms_auto_order_enabled",
    "sms_auto_dispatch_enabled",
    "sms_auto_out_for_delivery_enabled",
    "sms_auto_delivered_enabled",
    "sms_auto_on_hold_enabled",
    "sms_auto_returned_enabled",
    "sms_auto_cancelled_enabled",
    "sms_sender_id_event_types",
  ]);

  if (!allowedFields.has(field)) {
    throw new Error(`Field ${field} is not permitted for instant toggling`);
  }

  const supabase = createServiceClient();
  const { data: currentSettings } = await supabase.from("app_settings").select("id").single();

  if (currentSettings?.id) {
    const { error } = await supabase
      .from("app_settings")
      .update({ [field]: value })
      .eq("id", currentSettings.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("app_settings")
      .insert({ system_name: "MiBx Dispatch", [field]: value });

    if (error) throw error;
  }

  revalidatePath("/settings");
  revalidatePath("/settings/sms");
  return { success: true, field, value };
}

export async function sendTestSMS(formData: FormData) {
  const phone = formData.get("test_phone") as string;
  
  if (!phone) {
    throw new Error("Phone number is required");
  }

  try {
    const { sendSMS } = await import("@/lib/sms");
    const res = await sendSMS(phone, "This is a test message from MiBx Dispatch. Your SMS settings are working correctly!", false, `test_sms_${Date.now()}`, { orderName: "Test SMS" });
    
    if (res.success) {
      return { success: true, message: "Test SMS sent successfully!" };
    } else {
      return { success: false, error: res.message || "Failed to send SMS" };
    }
  } catch (error: any) {
    console.error("Test SMS Error:", error);
    return { success: false, error: error.message || "Failed to send test SMS" };
  }
}
