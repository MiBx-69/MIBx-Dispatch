"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireAdmin } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";

export async function addTransaction(formData: FormData) {
  let userCtx;
  try {
    userCtx = await requireAuth();
  } catch (err: any) {
    return { error: err.message || "Unauthorized" };
  }

  const type = formData.get("type") as "income" | "expense";
  const rawAmount = formData.get("amount") as string;
  const amount = parseFloat(rawAmount);
  const description = (formData.get("description") as string)?.trim();
  const category = (formData.get("category") as string)?.trim();

  if (isNaN(amount) || amount <= 0) {
    return { error: "Amount must be a positive number." };
  }

  if (!description) {
    return { error: "Description is required." };
  }

  if (type !== "income" && type !== "expense") {
    return { error: "Transaction type must be 'income' or 'expense'." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert({
    type,
    amount,
    description,
    category: category || null,
    created_by: userCtx.user.id
  });

  if (error) {
    console.error("Failed to add transaction:", error);
    return { error: "Failed to save transaction" };
  }

  revalidatePath("/finances");
  return { success: true };
}

export async function deleteTransaction(id: string) {
  try {
    await requireAdmin();
  } catch (err: any) {
    return { error: err.message || "Forbidden: Only admins can delete transactions" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);

  if (error) {
    console.error("Failed to delete transaction:", error);
    return { error: "Failed to delete transaction" };
  }

  revalidatePath("/finances");
  return { success: true };
}
