"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth-guard";
import { revalidatePath } from "next/cache";

export async function addTransaction(formData: FormData) {
  let userCtx;
  try {
    userCtx = await requireAdmin();
  } catch (err: any) {
    return { error: err.message || "Unauthorized: Admin access required" };
  }

  const type = formData.get("type") as "income" | "expense";
  const rawAmount = formData.get("amount") as string;
  const amount = parseFloat(rawAmount);
  const description = (formData.get("description") as string)?.trim();
  const category = (formData.get("category") as string)?.trim();
  const dateStr = (formData.get("date") as string)?.trim();
  const paymentMethod = (formData.get("payment_method") as string)?.trim() || "Cash";
  const receiptUrl = (formData.get("receipt_url") as string)?.trim() || null;
  const referenceId = (formData.get("reference_id") as string)?.trim() || null;

  if (isNaN(amount) || amount <= 0) {
    return { error: "Amount must be a positive number." };
  }

  if (!description) {
    return { error: "Description is required." };
  }

  if (type !== "income" && type !== "expense") {
    return { error: "Transaction type must be 'income' or 'expense'." };
  }

  const isCourierCharge =
    type === "expense" &&
    (category?.toLowerCase() === "courier charges" ||
      category?.toLowerCase() === "courier/delivery");

  const parsedDate = dateStr
    ? new Date(`${dateStr}T12:00:00+06:00`).toISOString()
    : new Date().toISOString();

  const supabase = await createClient();
  const { error } = await supabase.from("transactions").insert({
    type,
    amount,
    description,
    category: category || "Miscellaneous",
    date: parsedDate,
    payment_method: paymentMethod,
    receipt_url: receiptUrl,
    reference_id: referenceId,
    is_courier_charge: isCourierCharge,
    created_by: userCtx.user.id,
  });

  if (error) {
    console.error("Failed to add transaction:", error);
    return { error: "Failed to save transaction" };
  }

  revalidatePath("/finances");
  revalidatePath("/reports");
  revalidatePath("/");
  return { success: true };
}

export async function updateTransaction(params: {
  id: string;
  amount: number;
  description: string;
  category: string;
  date?: string;
  payment_method?: string;
  receipt_url?: string | null;
  reference_id?: string | null;
  edit_reason?: string;
}) {
  let userCtx;
  try {
    userCtx = await requireAdmin();
  } catch (err: any) {
    return { error: err.message || "Forbidden: Only admins can edit transactions" };
  }

  const supabase = createServiceClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", params.id)
    .single();

  if (fetchErr || !existing) {
    return { error: "Transaction not found" };
  }

  if (isNaN(params.amount) || params.amount <= 0) {
    return { error: "Amount must be a positive number." };
  }

  const now = new Date().toISOString();
  const prevAudit = Array.isArray((existing as any).audit_history)
    ? (existing as any).audit_history
    : [];

  const parsedDate = params.date
    ? params.date.includes("T")
      ? params.date
      : new Date(`${params.date}T12:00:00+06:00`).toISOString()
    : existing.date;

  const isCourierCharge =
    existing.type === "expense" &&
    (params.category?.toLowerCase() === "courier charges" ||
      params.category?.toLowerCase() === "courier/delivery");

  const { error: updateErr } = await supabase
    .from("transactions")
    .update({
      amount: params.amount,
      description: params.description.trim(),
      category: params.category.trim(),
      date: parsedDate,
      payment_method: params.payment_method || (existing as any).payment_method || "Cash",
      receipt_url: params.receipt_url ?? (existing as any).receipt_url ?? null,
      reference_id: params.reference_id ?? (existing as any).reference_id ?? null,
      is_courier_charge: isCourierCharge,
      updated_at: now,
      audit_history: [
        ...prevAudit,
        {
          timestamp: now,
          by: userCtx.user.email || "Admin",
          reason: params.edit_reason || "Updated transaction",
          previous: {
            amount: existing.amount,
            description: existing.description,
            category: existing.category,
            date: existing.date,
            payment_method: (existing as any).payment_method,
          },
        },
      ],
    })
    .eq("id", params.id);

  if (updateErr) {
    console.error("Failed to update transaction:", updateErr);
    return { error: "Failed to update transaction" };
  }

  revalidatePath("/finances");
  revalidatePath("/reports");
  revalidatePath("/");
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
  revalidatePath("/reports");
  revalidatePath("/");
  return { success: true };
}
