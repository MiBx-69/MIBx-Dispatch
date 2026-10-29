import { Metadata } from "next";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { StockInForm } from "@/components/inventory/stock-in-form";
import type { InventorySourceCategory } from "@/types/inventory";

export const metadata: Metadata = {
  title: "Stock In — Incoming Product Entry",
  description: "Record incoming product stock into the stock ledger",
};

export const dynamic = "force-dynamic";

export default async function StockInPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; name?: string }>;
}) {
  const params = await searchParams;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const supabase = createServiceClient();
  const [{ data: categories }, { data: profile }] = await Promise.all([
    supabase
      .from("inventory_source_categories")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user?.id || "")
      .single(),
  ]);

  return (
    <StockInForm
      categories={(categories || []) as unknown as InventorySourceCategory[]}
      initialProductId={params.productId}
      initialProductName={params.name}
      currentUserFullName={profile?.full_name || undefined}
    />
  );
}

