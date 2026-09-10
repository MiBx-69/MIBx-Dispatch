import { createServiceClient } from "@/lib/supabase/server";
import { ReturnsClient } from "./returns-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Returns" };
export const dynamic = "force-dynamic";

export default async function ReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();
  const page = parseInt(params.page || "1");
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

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

  let statsQuery = supabase.from("returns").select("status, order_total, return_delivery_fee");

  if (params.filter && params.filter !== "all") {
    query = query.eq("status", params.filter);
  }

  if (params.search) {
    const s = params.search;
    query = query.or(`consignment_id.ilike.%${s}%,return_reason.ilike.%${s}%,orders.shopify_order_name.ilike.%${s}%,orders.customer_name.ilike.%${s}%,orders.customer_phone.ilike.%${s}%`);
  }

  const [{ data: returnsData, count }, { data: statsData }] = await Promise.all([
    query,
    statsQuery
  ]);

  const returns = returnsData || [];
  const allStats = statsData || [];

  const totalReturns = allStats.length;
  const totalReturnValue = allStats.reduce((acc: number, r: any) => acc + (Number(r.order_total) || 0), 0);
  const totalReturnFees = allStats.reduce((acc: number, r: any) => acc + (Number(r.return_delivery_fee) || 0), 0);
  const pendingReturns = allStats.filter((r: any) => r.status === "in_transit" || r.status === "received" || r.status === "pending_verification").length;
  const processedReturns = allStats.filter((r: any) => ["inspected", "restocked", "damaged"].includes(r.status)).length;

  return (
    <ReturnsClient
      returns={returns}
      count={count || 0}
      totalReturns={totalReturns}
      totalReturnValue={totalReturnValue}
      totalReturnFees={totalReturnFees}
      pendingReturns={pendingReturns}
      processedReturns={processedReturns}
      currentFilter={params.filter}
      currentSearch={params.search}
      page={page}
      pageSize={pageSize}
    />
  );
}
