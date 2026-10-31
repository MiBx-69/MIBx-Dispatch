import { createServiceClient } from "@/lib/supabase/server";
import { ReturnsClient } from "./returns-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Returns Management — MiBx Dispatch" };
export const dynamic = "force-dynamic";

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{
    filter?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();

  let query = supabase
    .from("returns")
    .select(
      `
      *,
      orders!inner (
        id,
        shopify_order_name,
        shopify_order_id,
        customer_name,
        customer_phone,
        total_price,
        original_total_price,
        subtotal_price,
        original_subtotal_price,
        shipping_charge,
        discount_amount,
        total_tax,
        financial_status,
        fulfillment_status,
        line_items,
        pathao_consignment_id,
        shopify_created_at,
        internal_status
      )
    `
    )
    .order("returned_at", { ascending: false });

  if (params.startDate) {
    query = query.gte("returned_at", `${params.startDate}T00:00:00.000Z`);
  }
  if (params.endDate) {
    query = query.lte("returned_at", `${params.endDate}T23:59:59.999Z`);
  }

  const { data: allReturnsData } = await query;
  const rawReturns = allReturnsData || [];

  // Search filter by Shopify Order Number or Customer Phone Number (or Customer Name)
  const searchStr = (params.search || "").trim().toLowerCase();
  const searchedReturns = searchStr
    ? rawReturns.filter((r: any) => {
        const orderName = String(r.orders?.shopify_order_name || "").toLowerCase();
        const phone = String(r.orders?.customer_phone || "").toLowerCase();
        const custName = String(r.orders?.customer_name || "").toLowerCase();
        return (
          orderName.includes(searchStr) ||
          phone.includes(searchStr) ||
          custName.includes(searchStr)
        );
      })
    : rawReturns;

  // Apply category/sync filter
  const activeFilter = params.filter || "all";
  const displayedReturns = searchedReturns.filter((r: any) => {
    if (activeFilter === "partial") return r.return_type === "partial";
    if (activeFilter === "full") return r.return_type === "full";
    if (activeFilter === "sync_failed") return r.shopify_sync_status === "failed";
    return true;
  });

  return (
    <ReturnsClient
      returns={displayedReturns}
      allFilteredForStats={searchedReturns}
      currentFilter={activeFilter}
      currentSearch={params.search || ""}
      currentStartDate={params.startDate || ""}
      currentEndDate={params.endDate || ""}
    />
  );
}
