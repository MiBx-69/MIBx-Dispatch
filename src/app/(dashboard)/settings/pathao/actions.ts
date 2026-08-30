"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updatePathaoSettings(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  const client_id = formData.get("client_id")?.toString() || "";
  const client_secret = formData.get("client_secret")?.toString() || "";
  const username = formData.get("username")?.toString() || "";
  const password = formData.get("password")?.toString() || "";
  const store_id = formData.get("store_id")?.toString();

  const supabaseAdmin = createServiceClient();
  
  // Get the first app_settings row ID
  const { data: settings } = await supabaseAdmin.from("app_settings").select("id").single();
  
  if (!settings) {
    return { error: "Settings row not found." };
  }

  const { error } = await supabaseAdmin
    .from("app_settings")
    .update({
      pathao_client_id: client_id,
      pathao_client_secret: client_secret,
      pathao_username: username,
      pathao_password: password,
      pathao_store_id: store_id ? parseInt(store_id, 10) : null,
    })
    .eq("id", settings.id);

  if (error) {
    console.error("Failed to update Pathao settings:", error);
    return { error: "Failed to update settings." };
  }

  revalidatePath("/settings/pathao");
}
