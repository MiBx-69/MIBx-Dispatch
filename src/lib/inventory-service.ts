import { createServiceClient } from "@/lib/supabase/server";
import type {
  InventoryOverviewStats,
  ProductStockSummary,
  InventoryTransaction,
  InventoryProduct,
  InventorySourceCategory,
} from "@/types/inventory";

/**
 * Fetch real-time Inventory Overview statistics
 */
export async function getInventoryOverviewStats(): Promise<InventoryOverviewStats> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("inventory_overview_stats");
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return {
    totalUniqueProducts: Number(row?.total_products ?? 0),
    totalStockReceived: Number(row?.total_stock_in ?? 0),
    totalStockOut: Number(row?.total_stock_out ?? 0),
    currentAvailableStock: Number(row?.available_stock ?? 0),
    todayStockIn: Number(row?.today_stock_in ?? 0),
    todayStockOut: Number(row?.today_stock_out ?? 0),
  };
}

/**
 * Fetch low stock products (current stock <= threshold)
 */
export async function getLowStockProducts(threshold = 5, limit = 5): Promise<ProductStockSummary[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("inventory_product_stock_view")
    .select("*")
    .eq("status", "active")
    .lte("current_stock", threshold)
    .order("current_stock", { ascending: true })
    .limit(limit);

  return (data || []) as unknown as ProductStockSummary[];
}

/**
 * Fetch top stock in products
 */
export async function getTopStockInProducts(limit = 5): Promise<ProductStockSummary[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("inventory_product_stock_view")
    .select("*")
    .gt("total_stock_in", 0)
    .order("total_stock_in", { ascending: false })
    .limit(limit);

  return (data || []) as unknown as ProductStockSummary[];
}

/**
 * Fetch top stock out products
 */
export async function getTopStockOutProducts(limit = 5): Promise<ProductStockSummary[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("inventory_product_stock_view")
    .select("*")
    .gt("total_stock_out", 0)
    .order("total_stock_out", { ascending: false })
    .limit(limit);

  return (data || []) as unknown as ProductStockSummary[];
}

/**
 * Fetch recent inventory transactions
 */
export async function getRecentTransactions(limit = 6): Promise<InventoryTransaction[]> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("inventory_transactions")
    .select(`
      *,
      inventory_products (
        id,
        product_name,
        sku,
        style_code,
        status
      ),
      profiles:created_by (
        id,
        full_name,
        role
      )
    `)
    .order("transaction_date", { ascending: false })
    .limit(limit);

  return (data || []) as unknown as InventoryTransaction[];
}

