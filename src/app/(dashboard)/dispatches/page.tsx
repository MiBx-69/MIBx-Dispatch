import { createServiceClient } from "@/lib/supabase/server";
import { DispatchesClient } from "./dispatches-client";
import { Metadata } from "next";
import { getUnifiedReportMetrics, resolveDateRange } from "@/lib/reporting-engine";

export const metadata: Metadata = { title: "Dispatches" };
export const dynamic = "force-dynamic";

export default async function DispatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; dateFilter?: string; startDate?: string; endDate?: string; search?: string; }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();
  const page = parseInt(params.page || "1");
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const dateFilter = params.dateFilter || "all";

  let query = supabase
    .from("dispatches")
    .select("*, orders!inner(*, returns(id, return_type, status))", { count: "exact" })
    .neq("orders.internal_status", "cancelled")
    .order("dispatched_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  const STATUS_MAP: Record<string, string[]> = {
    "Pending": ["Pending", "order.assigned_for_pickup", "order.pickup_cancelled"],
    "Picked Up": ["Picked Up", "order.pickup_collected"],
    "In Transit": ["In Transit", "order.in_transit", "order.at_delivery_hub"],
    "Out for Delivery": ["Out for Delivery", "order.out_for_delivery"],
    "Delivered": ["Delivered", "order.delivered", "order.partial_delivery", "order.payment_received"],
    "Return": ["Return", "order.return_in_transit"],
    "Return Completed": ["Return Completed", "order.returned"],
    "Hold": ["Hold", "order.hold", "order.failed"],
    "Cancelled": ["Cancelled", "order.cancelled"],
  };

  if (params.status) {
    const mapped = STATUS_MAP[params.status] || [params.status];
    query = query.in("pathao_order_status", mapped);
  }

  if (params.search) {
    const s = params.search;
    query = query.or(`consignment_id.ilike.%${s}%,recipient_phone.ilike.%${s}%,shopify_order_name.ilike.%${s}%`);
  }

  const { startDateStr, endDateStr } = resolveDateRange(dateFilter, params.startDate, params.endDate);
  if (startDateStr && endDateStr) {
    query = query.gte("dispatched_at", startDateStr).lte("dispatched_at", endDateStr);
  }

  const [
    { data: rawDispatches, count },
    metrics,
    { data: settings },
  ] = await Promise.all([
    query,
    getUnifiedReportMetrics({
      dateFilter,
      startDate: params.startDate,
      endDate: params.endDate,
      search: params.search,
    }),
    supabase.from("app_settings").select("pathao_store_id").single(),
  ]);
  
  const dispatches = rawDispatches?.sort((a: any, b: any) => {
    const numA = parseInt(a.orders.shopify_order_name.replace(/\D/g, ""));
    const numB = parseInt(b.orders.shopify_order_name.replace(/\D/g, ""));
    return numB - numA;
  });

  const dispatchStats = {
    totalQuantity: metrics.dispatchedCount,
    totalAmount: metrics.amountToCollect,
    deliveredCount: metrics.deliveredCount,
    deliveredAmount: metrics.deliveredRevenue,
    returnedCount: metrics.returnedCount,
    returnedAmount: metrics.returnedValue,
    dateFilter,
    startDate: params.startDate,
    endDate: params.endDate,
  };

  return (
    <DispatchesClient
      dispatches={dispatches || []}
      count={count || 0}
      currentStatus={params.status}
      currentSearch={params.search}
      pathaoStoreId={settings?.pathao_store_id}
      dateFilter={dateFilter}
      startDate={params.startDate}
      endDate={params.endDate}
      totalAmount={metrics.amountToCollect}
      totalQuantity={metrics.dispatchedCount}
      stats={dispatchStats}
      page={page}
      pageSize={pageSize}
    />
  );
}
