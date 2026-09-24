import { type NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runFullShopifySalesSync } from "@/lib/shopify-sales-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 mins

export async function POST(request: NextRequest) {
  try {
    // 1. Verify user is authenticated
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser().catch(() => ({ data: { user: null } }));

    // Optional admin check - if not logged in via cookie, check Authorization Bearer / CRON_SECRET
    if (!user) {
      const authHeader = request.headers.get("authorization");
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
      const cronSecret = process.env.CRON_SECRET;
      if (!cronSecret || bearerToken !== cronSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const fullSync = Boolean(body.fullSync);

    // 2. Run sync
    const result = await runFullShopifySalesSync({ fullSync });

    if (!result.success) {
      return NextResponse.json(
        { error: "Sync failed", details: result.error, result },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Shopify Sales Sync completed successfully",
      stats: result,
    });
  } catch (error: any) {
    console.error("[Sales Sync API] Internal Error:", error);
    return NextResponse.json(
      { error: "Failed to trigger sync", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const supabase = createServiceClient();

    const [
      { count: ordersCount },
      { count: lineItemsCount },
      { count: productsCount },
      { count: collectionsCount },
      { data: latestOrder },
    ] = await Promise.all([
      supabase.from("shopify_orders").select("*", { count: "exact", head: true }),
      supabase.from("shopify_line_items").select("*", { count: "exact", head: true }),
      supabase.from("shopify_products").select("*", { count: "exact", head: true }),
      supabase.from("shopify_collections").select("*", { count: "exact", head: true }),
      supabase
        .from("shopify_orders")
        .select("synced_at")
        .order("synced_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      ordersCount: ordersCount || 0,
      lineItemsCount: lineItemsCount || 0,
      productsCount: productsCount || 0,
      collectionsCount: collectionsCount || 0,
      lastSyncedAt: latestOrder?.synced_at || null,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to retrieve sync status", details: error.message },
      { status: 500 }
    );
  }
}
