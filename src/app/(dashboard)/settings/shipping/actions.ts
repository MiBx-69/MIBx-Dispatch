"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateShippingSettings(formData: FormData) {
  const delivery_charge_inside_dhaka = formData.get("delivery_charge_inside_dhaka");
  const delivery_charge_outside_dhaka = formData.get("delivery_charge_outside_dhaka");
  const auto_mark_delivered_days = formData.get("auto_mark_delivered_days");

  const supabase = createServiceClient();
  const { data: currentSettings } = await supabase.from("app_settings").select("id").single();

  if (currentSettings?.id) {
    const { error } = await supabase
      .from("app_settings")
      .update({
        delivery_charge_inside_dhaka: delivery_charge_inside_dhaka ? Number(delivery_charge_inside_dhaka) : null,
        delivery_charge_outside_dhaka: delivery_charge_outside_dhaka ? Number(delivery_charge_outside_dhaka) : null,
        auto_mark_delivered_days: auto_mark_delivered_days ? Number(auto_mark_delivered_days) : null,
      })
      .eq("id", currentSettings.id);
    
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("app_settings")
      .insert({
        system_name: "MiBx Dispatch",
        delivery_charge_inside_dhaka: delivery_charge_inside_dhaka ? Number(delivery_charge_inside_dhaka) : null,
        delivery_charge_outside_dhaka: delivery_charge_outside_dhaka ? Number(delivery_charge_outside_dhaka) : null,
        auto_mark_delivered_days: auto_mark_delivered_days ? Number(auto_mark_delivered_days) : null,
      });
      
    if (error) throw error;
  }

  revalidatePath("/settings");
  revalidatePath("/settings/shipping");
}
