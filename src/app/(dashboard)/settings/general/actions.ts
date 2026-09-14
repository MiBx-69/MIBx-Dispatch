"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateGeneralSettings(formData: FormData) {
  const supabase = createServiceClient();
  const companyName = formData.get("companyName") as string;
  const systemName = formData.get("systemName") as string;

  if (!companyName || !systemName) {
    throw new Error("Both Company Name and System Name are required");
  }

  const { error } = await supabase
    .from("app_settings")
    .update({ 
      company_name: companyName,
      system_name: systemName
    })
    // We only have one row, so we just filter by NOT IS NULL to update it
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/settings");
  revalidatePath("/settings/general");
  revalidatePath("/reports");
}
