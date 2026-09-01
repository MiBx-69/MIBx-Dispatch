import { createServiceClient } from "@/lib/supabase/server";
import { DispatchesClient } from "./dispatches-client";

export const metadata = { title: "Dispatches" };

export default async function DispatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();
  const page = parseInt(params.page || "1");
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("dispatches")
    .select("*, orders!inner(*)", { count: "exact" })
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

  const { data: rawDispatches, count } = await query;
  
  const dispatches = rawDispatches?.sort((a: any, b: any) => {
    // Sort strictly by order name descending (e.g. #1529 before #1513)
    const numA = parseInt(a.orders.shopify_order_name.replace(/\D/g, ""));
    const numB = parseInt(b.orders.shopify_order_name.replace(/\D/g, ""));
    return numB - numA;
  });

  const { data: settings } = await supabase.from("app_settings").select("pathao_store_id").single();

  return (
    <DispatchesClient
      dispatches={dispatches || []}
      count={count || 0}
      currentStatus={params.status}
      pathaoStoreId={settings?.pathao_store_id}
    />
  );
}
