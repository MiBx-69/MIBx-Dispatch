import { createServiceClient } from "@/lib/supabase/server";
import { ReturnsClient } from "./returns-client";
import type { Metadata } from "next";
import { getReturnsPageMetrics } from "@/lib/reporting-engine";

export const metadata: Metadata = { title: "Returns" };
export const dynamic = "force-dynamic";

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; search?: string; page?: string; pageSize?: string }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();
  const page = parseInt(params.page || "1");
  const isAll = params.pageSize === "all";
  const pageSize = isAll ? 5000 : parseInt(params.pageSize || "25");
  const offset = isAll ? 0 : (page - 1) * pageSize;

  let query = supabase
    .from("returns")
    .select(`
      *,
      orders!inner (
        id,
        shopify_order_name,
        shopify_order_id,
        customer_name,
        customer_phone,
        total_price,
        subtotal_price,
        line_items,
        pathao_consignment_id,
        shopify_created_at,
        internal_status
      )
    `, { count: "exact" })
    .order("returned_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (params.filter && params.filter !== "all") {
    if (params.filter === "pending_verification") {
      query = query.or("status.eq.pending_verification,and(return_type.eq.partial,is_verified.eq.false)");
    } else {
      query = query.eq("status", params.filter);
    }
  }

  if (params.search) {
    const s = params.search;
    query = query.or(`consignment_id.ilike.%${s}%,return_reason.ilike.%${s}%,orders.shopify_order_name.ilike.%${s}%,orders.customer_name.ilike.%${s}%,orders.customer_phone.ilike.%${s}%`);
  }

  const [
    { data: returnsData, count },
    metrics,
  ] = await Promise.all([
    query,
    getReturnsPageMetrics(params.search),
  ]);

  const returns = returnsData || [];

  return (
    <ReturnsClient
      returns={returns}
      count={count || 0}
      totalReturns={metrics.returnedCount}
      totalReturnValue={metrics.returnedValue}
      totalReturnFees={metrics.returnFees}
      pendingReturns={metrics.pendingReturnsCount}
      processedReturns={metrics.processedReturnsCount}
      needsAttentionCount={metrics.needsAttentionCount}
      currentFilter={params.filter}
      currentSearch={params.search}
      page={page}
      pageSize={pageSize}
    />
  );
}
