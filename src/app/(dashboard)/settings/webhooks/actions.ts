"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateWebhookSecret(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const secret = formData.get("shopify_webhook_secret")?.toString() || "";

  const supabaseAdmin = createServiceClient();
  
  const { data: settings } = await supabaseAdmin.from("app_settings").select("id").single();
  
  if (!settings) return { error: "Settings not found." };

  const { error } = await supabaseAdmin
    .from("app_settings")
    .update({ shopify_webhook_secret: secret })
    .eq("id", settings.id);

  if (error) return { error: "Failed to update webhook secret." };

  revalidatePath("/settings/webhooks");
}

export async function updatePathaoWebhookSecret(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const secret = formData.get("pathao_webhook_secret")?.toString() || "";

  const supabaseAdmin = createServiceClient();
  
  const { data: settings } = await supabaseAdmin.from("app_settings").select("id").single();
  
  if (!settings) return { error: "Settings not found." };

  const { error } = await supabaseAdmin
    .from("app_settings")
    .update({ pathao_webhook_secret: secret })
    .eq("id", settings.id);

  if (error) return { error: "Failed to update Pathao webhook secret. (Did you run the DB migration?)" };

  revalidatePath("/settings/webhooks");
}
