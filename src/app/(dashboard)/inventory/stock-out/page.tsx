import { Metadata } from "next";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { StockOutForm } from "@/components/inventory/stock-out-form";

export const metadata: Metadata = {
  title: "Stock Out — Outgoing Product Entry",
  description: "Record outgoing product stock and deductions from the stock ledger",
};

export const dynamic = "force-dynamic";

export default async function StockOutPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; name?: string }>;
}) {
  const params = await searchParams;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("user_id", user?.id || "")
    .single();

  return (
    <StockOutForm
      initialProductId={params.productId}
      initialProductName={params.name}
      currentUserFullName={profile?.full_name || undefined}
    />
  );
}

