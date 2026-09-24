import { SupabaseClient } from "@supabase/supabase-js";
import { getCache, setCache } from "@/lib/redis";

export type OrderStatusFilter = "delivered" | "exclude_returns" | "all";

export interface OrderStatusInfo {
  statusMap: Map<string, string>;
  deliveredOrderIds: Set<string>;
  returnedOrderIds: Set<string>;
}

const STATUS_CACHE_KEY = "sales:order_status_map";
const STATUS_CACHE_TTL = 120; // 2 minutes — order statuses don't change that frequently

/**
 * Fetches order internal_status mapping from the dispatch orders table.
 * Uses Redis caching to avoid hitting the DB on every single API call.
 */
export async function getOrderStatusMap(supabase: SupabaseClient): Promise<OrderStatusInfo> {
  // Try Redis cache first for the raw status data
  const cached = await getCache<Array<{ shopify_order_id: string; shopify_order_name: string | null; internal_status: string }>>(STATUS_CACHE_KEY);

  let ordersData: any[] | null = cached;

  if (!ordersData) {
    const { data: orders, error } = await supabase
      .from("orders")
      .select("shopify_order_id, shopify_order_name, internal_status");

    if (error) {
      console.error("[SalesStatusHelper] Error fetching orders status:", error);
    }

    ordersData = orders || [];
    // Cache the raw data in Redis
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

/**
 * Invalidate the cached order status map (call after sync or status change)
 */
export async function invalidateOrderStatusCache(): Promise<void> {
  const { deleteCache } = await import("@/lib/redis");
  await deleteCache(STATUS_CACHE_KEY);
}

/**
 * Filter line items based on order status filter
 * Default: 'delivered' (ONLY show successfully delivered as sold, exclude returns)
 */
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
      // ONLY successfully delivered as sold (excludes returns, cancellations, pending, in transit)
      return status === "delivered";
    }

    if (filter === "exclude_returns") {
      // Exclude returns and cancellations
      return status !== "returned" && status !== "cancelled";
    }

    return true;
  });
}
