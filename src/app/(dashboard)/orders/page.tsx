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

  if (params.status === "archived") {
    query = query.eq("is_archived", true);
  } else if (params.status === "everything") {
    query = query.eq("is_archived", false);
  } else if (params.status === "in_progress") {
    query = query.eq("is_archived", false).eq("fulfillment_status", "in_progress").neq("internal_status", "dispatched");
  } else if (params.status === "dispatched") {
    query = query.eq("is_archived", false).or("internal_status.eq.dispatched,fulfillment_status.eq.fulfilled");
  } else if (params.status === "unfulfilled") {
    query = query.eq("is_archived", false)
                 .or("fulfillment_status.eq.unfulfilled,fulfillment_status.is.null")
                 .neq("internal_status", "dispatched")
                 .neq("internal_status", "cancelled");
  } else if (params.status === "on_hold") {
    query = query.eq("is_archived", false)
                 .eq("fulfillment_status", "on_hold")
                 .neq("internal_status", "dispatched");
  } else if (!params.status || params.status === "all") {
    query = query.eq("is_archived", false)
                 .neq("internal_status", "dispatched")
                 .neq("internal_status", "cancelled")
                 .or("fulfillment_status.neq.fulfilled,fulfillment_status.is.null");
  } else {
    query = query.eq("is_archived", false).eq("internal_status", params.status);
  }

  if (params.search) {
    query = query.or(
      `customer_name.ilike.%${params.search}%,customer_phone.ilike.%${params.search}%,shopify_order_name.ilike.%${params.search}%,pathao_consignment_id.ilike.%${params.search}%`
    );
  }

  const { data: orders, count } = await query;

  // Get count of in_progress orders
  const { count: inProgressCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("is_archived", false)
    .eq("fulfillment_status", "in_progress")
    .neq("internal_status", "dispatched");

  // Get Pathao location lists for dispatch modal
  const { data: settings } = await supabase.from("app_settings").select("pathao_store_id").single();

  return (
    <OrdersClient
      orders={orders || []}
      total={count || 0}
      inProgressCount={inProgressCount || 0}
      page={page}
      pageSize={pageSize}
      currentStatus={params.status}
      currentSearch={params.search}
      pathaoStoreId={settings?.pathao_store_id}
    />
  );
}
