import { createServiceClient } from "@/lib/supabase/server";
import { FinancesClient } from "./finances-client";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Finances & Expenses" };

export default async function FinancesPage() {
  const supabase = createServiceClient();
  
  // Ensure user is an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect("/"); // Or show unauthorized message
  }

  // Fetch all transactions ordered by most recent
  const { data: transactions } = await supabase
    .from("transactions")
    .select("*")
    .order("date", { ascending: false });

  // Calculate totals
  let totalIncome = 0;
  let totalExpense = 0;

  if (transactions) {
    transactions.forEach(t => {
      if (t.type === "income") totalIncome += Number(t.amount);
      if (t.type === "expense") totalExpense += Number(t.amount);
    });
  }

  return (
    <FinancesClient 
      transactions={transactions || []} 
      totalIncome={totalIncome} 
      totalExpense={totalExpense} 
    />
  );
}
