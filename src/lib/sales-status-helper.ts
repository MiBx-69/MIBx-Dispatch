import { SupabaseClient } from "@supabase/supabase-js";
import { getCache, setCache } from "@/lib/redis";

export type OrderStatusFilter = "delivered" | "exclude_returns" | "all";

export interface OrderStatusInfo {
  statusMap: Map<string, string>;
  deliveredOrderIds: Set<string>;
  returnedOrderIds: Set<string>;
}

const STATUS_CACHE_KEY = "sales:order_status_map:v2";
const STATUS_CACHE_TTL = 120;

export async function getOrderStatusMap(supabase: SupabaseClient): Promise<OrderStatusInfo> {
  const cached = await getCache<
    Array<{ shopify_order_id: string; shopify_order_name: string | null; internal_status: string }>
  >(STATUS_CACHE_KEY);

  let ordersData: any[] | null = cached;

  if (!ordersData) {
    const allOrders: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data: batch, error } = await supabase
        .from("orders")
        .select("shopify_order_id, shopify_order_name, internal_status")
        .eq("is_archived", false)
        .range(offset, offset + pageSize - 1);

      if (error) {
        console.error("[SalesStatusHelper] Error fetching orders status:", error);
        break;
      }
      if (!batch || batch.length === 0) break;
      allOrders.push(...batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    ordersData = allOrders;
    await setCache(STATUS_CACHE_KEY, ordersData, STATUS_CACHE_TTL);
  }

  const statusMap = new Map<string, string>();
  const deliveredOrderIds = new Set<string>();
  const returnedOrderIds = new Set<string>();

  (ordersData || []).forEach((o: any) => {
    const status = (o.internal_status || "pending").toLowerCase().trim();
    if (o.shopify_order_id) {
      const idStr = String(o.shopify_order_id);
      statusMap.set(idStr, status);
      if (status === "delivered") deliveredOrderIds.add(idStr);
      if (status === "returned") returnedOrderIds.add(idStr);
    }
    if (o.shopify_order_name) {
      statusMap.set(o.shopify_order_name, status);
    }
  });

  return { statusMap, deliveredOrderIds, returnedOrderIds };
}

export async function invalidateOrderStatusCache(): Promise<void> {
  const { deleteCache } = await import("@/lib/redis");
  await deleteCache(STATUS_CACHE_KEY);
}

export function filterLineItemsByStatus<T extends { shopify_order_id: string }>(
  items: T[],
  statusMap: Map<string, string>,
  filter: OrderStatusFilter = "delivered"
): T[] {
  if (filter === "all") return items;

  return items.filter((item) => {
    const rawId = item.shopify_order_id.replace(/\D/g, "");
    const status = statusMap.get(rawId) || "pending";

    if (filter === "delivered") {
      return status === "delivered";
    }

    if (filter === "exclude_returns") {
      return status !== "returned" && status !== "cancelled";
    }

    return true;
  });
}
