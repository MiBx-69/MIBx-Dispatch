import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PrintClient } from "./print-client";

export default async function PrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const params = await searchParams;
  const idsParam = params.ids;
  if (!idsParam) {
    return (
      <div className="p-8 text-center text-zinc-900 bg-white min-h-screen">
        <h1 className="text-2xl font-bold">No orders selected</h1>
        <p className="mt-2 text-zinc-600">Please provide order IDs in the URL.</p>
      </div>
    );
  }
  
  const ids = idsParam.split(',').map(id => id.trim()).filter(id => id.length > 0);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch orders with their dispatches
  const { data: orders, error } = await supabase
    .from("orders")
    .select(`
      *,
      dispatches (
        consignment_id,
        amount_to_collect
      )
    `)
    .in("id", ids);

  if (error || !orders) {
    return (
      <div className="p-8 text-center text-red-600 bg-white min-h-screen">
        <h1 className="text-2xl font-bold">Error loading orders</h1>
        <p className="mt-2 text-zinc-800">{error?.message || "Unknown error"}</p>
      </div>
    );
  }

  // Also fetch store settings for merchant info
  const { data: settings } = await supabase
    .from("app_settings")
    .select("shopify_shop_domain")
    .single();

  return <PrintClient orders={orders} shopDomain={settings?.shopify_shop_domain} />;
}
