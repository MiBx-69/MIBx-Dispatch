import { Metadata } from "next";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import {
  getInventoryOverviewStats,
  getLowStockProducts,
  getTopStockInProducts,
  getTopStockOutProducts,
  getRecentTransactions,
} from "@/lib/inventory-service";
import type { ProductStockSummary } from "@/types/inventory";
import { InventoryOverviewClient } from "@/components/inventory/inventory-overview-client";

export const metadata: Metadata = {
  title: "Inventory Overview — MiBx Dispatch",
  description: "Real-time stock ledger, product inventory, and stock movement overview",
};

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    page?: string;
    sortBy?: string;
    sortOrder?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const pageSize = 30;
  const offset = (page - 1) * pageSize;
  const search = params.search?.trim() || "";
  const sortBy = params.sortBy || "updated_at";
  const sortOrder = params.sortOrder === "asc" ? true : false;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user?.id || "")
    .single();

  // Build products query
  let productsQuery = supabase
    .from("inventory_product_stock_view")
    .select("*", { count: "exact" })
    .eq("status", "active");

  if (search) {
    productsQuery = productsQuery.or(
      `product_name.ilike.%${search}%,sku.ilike.%${search}%,style_code.ilike.%${search}%`
    );
  }

  const validSortColumns = ["product_name", "sku", "style_code", "current_stock", "total_stock_in", "total_stock_out", "last_transaction_date", "updated_at", "created_at"];
  const resolvedSort = validSortColumns.includes(sortBy) ? sortBy : "updated_at";

  productsQuery = productsQuery
    .order(resolvedSort, { ascending: sortOrder, nullsFirst: false })
    .range(offset, offset + pageSize - 1);

  const [
    stats,
    lowStockProducts,
    topStockIn,
    topStockOut,
    recentTransactions,
    { data: recentlyAdded },
    { data: products, count: totalProductsCount },
  ] = await Promise.all([
    getInventoryOverviewStats(),
    getLowStockProducts(5, 5),
    getTopStockInProducts(5),
    getTopStockOutProducts(5),
    getRecentTransactions(6),
    supabase
      .from("inventory_product_stock_view")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(5),
    productsQuery,
  ]);

  return (
    <InventoryOverviewClient
      stats={stats}
      products={(products || []) as unknown as ProductStockSummary[]}
      totalProductsCount={totalProductsCount || 0}
      lowStockProducts={lowStockProducts}
      topStockIn={topStockIn}
      topStockOut={topStockOut}
      recentTransactions={recentTransactions}
      recentlyAdded={(recentlyAdded || []) as unknown as ProductStockSummary[]}
      currentPage={page}
      pageSize={pageSize}
      currentSearch={search}
      currentSortBy={sortBy}
      currentSortOrder={sortOrder ? "asc" : "desc"}
      userRole={profile?.role || "staff"}
    />
  );
}

