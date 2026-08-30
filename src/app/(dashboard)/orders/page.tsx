import { createServiceClient } from "@/lib/supabase/server";
import { OrdersClient } from "./orders-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Orders" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();

  const page = parseInt(params.page || "1");
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("shopify_created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (params.status && params.status !== "all") {
    query = query.eq("internal_status", params.status);
  }

  if (params.search) {
    query = query.or(
      `customer_name.ilike.%${params.search}%,customer_phone.ilike.%${params.search}%,shopify_order_name.ilike.%${params.search}%,pathao_consignment_id.ilike.%${params.search}%`
    );
  }

  const { data: orders, count } = await query;

  // Get Pathao location lists for dispatch modal
  const { data: settings } = await supabase.from("app_settings").select("pathao_store_id").single();

  return (
    <OrdersClient
      orders={orders || []}
      total={count || 0}
      page={page}
      pageSize={pageSize}
      currentStatus={params.status}
      currentSearch={params.search}
      pathaoStoreId={settings?.pathao_store_id}
    />
  );
}
