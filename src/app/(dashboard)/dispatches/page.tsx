import { createServiceClient } from "@/lib/supabase/server";
import { DispatchesClient } from "./dispatches-client";
import { Metadata } from "next";

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

  let query = supabase
    .from("dispatches")
    .select("*, orders!inner(*, returns(id, return_type, status))", { count: "exact" })
    .neq("orders.internal_status", "cancelled")
    .order("dispatched_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  let statsQuery = supabase
    .from("dispatches")
    .select("amount_to_collect, orders!inner(internal_status)")
    .neq("orders.internal_status", "cancelled");

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
    statsQuery = statsQuery.in("pathao_order_status", mapped);
  }

  if (params.search) {
    const s = params.search;
    query = query.or(`consignment_id.ilike.%${s}%,recipient_phone.ilike.%${s}%,shopify_order_name.ilike.%${s}%`);
    statsQuery = statsQuery.or(`consignment_id.ilike.%${s}%,recipient_phone.ilike.%${s}%,shopify_order_name.ilike.%${s}%`);
  }

  // Date Filtering
  const dateFilter = params.dateFilter || "all";
  let startDateStr = "";
  let endDateStr = "";

  const now = new Date();
  
  if (dateFilter === "today") {
    startDateStr = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    endDateStr = new Date(now.setHours(23, 59, 59, 999)).toISOString();
  } else if (dateFilter === "yesterday") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    startDateStr = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString();
    endDateStr = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString();
  } else if (dateFilter === "this_month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    startDateStr = new Date(firstDay.setHours(0, 0, 0, 0)).toISOString();
    endDateStr = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  } else if (dateFilter === "custom" && params.startDate && params.endDate) {
    startDateStr = new Date(params.startDate).toISOString();
    const end = new Date(params.endDate);
    endDateStr = new Date(end.setHours(23, 59, 59, 999)).toISOString();
  }

  if (startDateStr && endDateStr) {
    query = query.gte("dispatched_at", startDateStr).lte("dispatched_at", endDateStr);
    statsQuery = statsQuery.gte("dispatched_at", startDateStr).lte("dispatched_at", endDateStr);
  }

  const [{ data: rawDispatches, count }, { data: statsData }] = await Promise.all([
    query,
    statsQuery
  ]);
  
  const dispatches = rawDispatches?.sort((a: any, b: any) => {
    const numA = parseInt(a.orders.shopify_order_name.replace(/\D/g, ""));
    const numB = parseInt(b.orders.shopify_order_name.replace(/\D/g, ""));
    return numB - numA;
  });

  const totalAmount = statsData?.reduce((sum: number, d: any) => sum + Number(d.amount_to_collect || 0), 0) || 0;
  const totalQuantity = statsData?.length || 0;

  const { data: settings } = await supabase.from("app_settings").select("pathao_store_id").single();

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
      totalAmount={totalAmount}
      totalQuantity={totalQuantity}
      page={page}
      pageSize={pageSize}
    />
  );
}
