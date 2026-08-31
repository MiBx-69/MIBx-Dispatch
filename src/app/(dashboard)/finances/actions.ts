"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function addTransaction(formData: FormData) {
  const type = formData.get("type") as "income" | "expense";
  const amount = parseFloat(formData.get("amount") as string);
  const description = formData.get("description") as string;
  const category = formData.get("category") as string;
  
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase.from("transactions").insert({
    type,
    amount,
    description,
    category: category || null,
    created_by: user.id
  });

  if (error) {
    console.error("Failed to add transaction:", error);
    return { error: "Failed to save transaction" };
  }

  revalidatePath("/finances");
  return { success: true };
}

export async function deleteTransaction(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unauthorized" };
  }

  const { error } = await supabase.from("transactions").delete().eq("id", id);

  if (error) {
    console.error("Failed to delete transaction:", error);
    return { error: "Failed to delete transaction" };
  }

  revalidatePath("/finances");
  return { success: true };
}
