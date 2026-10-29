import { NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import {
  getInventoryOverviewStats,
  getLowStockProducts,
  getTopStockInProducts,
  getTopStockOutProducts,
  getRecentTransactions,
} from "@/lib/inventory-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const [
      stats,
      lowStockProducts,
      topStockIn,
      topStockOut,
      recentTransactions,
      { data: recentlyAdded },
    ] = await Promise.all([
      getInventoryOverviewStats(),
      getLowStockProducts(5, 5),
      getTopStockInProducts(5),
      getTopStockOutProducts(5),
      getRecentTransactions(8),
      supabase
        .from("inventory_product_stock_view")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    return NextResponse.json({
      stats,
      lowStockProducts,
      topStockIn,
      topStockOut,
      recentTransactions,
      recentlyAdded: recentlyAdded || [],
    });
  } catch (err: any) {
    console.error("GET /api/inventory/overview error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch overview" }, { status: 500 });
  }
}

