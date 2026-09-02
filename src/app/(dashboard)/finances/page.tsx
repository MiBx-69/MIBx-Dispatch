import { createClient } from "@/lib/supabase/server";
import { FinancesClient } from "./finances-client";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Finances & Expenses" };
export const dynamic = "force-dynamic";

export default async function FinancesPage() {
  const supabase = await createClient();
  
  // Ensure user is an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-zinc-400">You need administrator privileges to view this page. Current role: {profile?.role || "none"}</p>
      </div>
    );
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
    transactions.forEach((t: any) => {
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
