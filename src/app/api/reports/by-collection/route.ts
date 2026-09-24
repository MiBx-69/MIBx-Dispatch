import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getCache, setCache } from "@/lib/redis";
import { getOrderStatusMap, filterLineItemsByStatus, type OrderStatusFilter } from "@/lib/sales-status-helper";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const orderStatus = (searchParams.get("orderStatus") || "delivered") as OrderStatusFilter;
    const vendors = searchParams.getAll("vendors[]").concat(searchParams.get("vendors")?.split(",").filter(Boolean) || []);
    const collections = searchParams.getAll("collections[]").concat(searchParams.get("collections")?.split(",").filter(Boolean) || []);
    const noCache = searchParams.get("refresh") === "true";

    // Cache key
    const cacheParams = {
      startDate, endDate, orderStatus,
      vendors: vendors.sort(), collections: collections.sort(),
    };
    const cacheKey = `sales:collection:${Buffer.from(JSON.stringify(cacheParams)).toString("base64").substring(0, 64)}`;

    if (!noCache) {
      const cached = await getCache<any>(cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    const supabase = createServiceClient();

    // Run all queries in parallel
    let lineItemsQuery = supabase.from("shopify_line_items").select(`
      shopify_order_id,
      shopify_product_id,
      product_name,
      vendor,
      quantity,
      price,
      collection_ids,
      order_created_at
    `);

    if (startDate) lineItemsQuery = lineItemsQuery.gte("order_created_at", startDate);
    if (endDate) lineItemsQuery = lineItemsQuery.lte("order_created_at", endDate);
    if (vendors.length > 0) lineItemsQuery = lineItemsQuery.in("vendor", vendors);
    if (collections.length > 0) lineItemsQuery = lineItemsQuery.overlaps("collection_ids", collections);

    const [collectionsResult, lineItemsResult, statusInfo, productsResult] = await Promise.all([
      supabase
        .from("shopify_collections")
        .select("shopify_collection_id, title, handle, products_count")
        .order("products_count", { ascending: false }),
      lineItemsQuery,
      getOrderStatusMap(supabase),
      supabase.from("shopify_products").select("shopify_product_id, vendor"),
    ]);

    if (collectionsResult.error) throw collectionsResult.error;
    if (lineItemsResult.error) throw lineItemsResult.error;

    const productVendorMap = new Map<string, string>();
    (productsResult.data || []).forEach((p: any) => {
      if (p.vendor) productVendorMap.set(p.shopify_product_id, p.vendor.trim());
    });

    const rawItems = lineItemsResult.data || [];

    // Filter by order status: default delivered only (excludes returns, cancellations, etc.)
    const items = filterLineItemsByStatus(rawItems, statusInfo.statusMap, orderStatus);

    let globalRevenue = 0;

    const colStatsMap = new Map<
      string,
      {
        totalRevenue: number;
        totalUnits: number;
        orders: Set<string>;
        vendorsSet: Set<string>;
        productsMap: Map<string, { productId: string; title: string; units: number; revenue: number }>;
      }
    >();

    items.forEach((item: any) => {
      const rev = Number(item.quantity) * Number(item.price);
      const qty = Number(item.quantity);
      globalRevenue += rev;

      const currentVendor = item.shopify_product_id ? productVendorMap.get(item.shopify_product_id) : null;
      const vendorName = (currentVendor || item.vendor || "").trim();

      const cIds = item.collection_ids || [];
      cIds.forEach((cId: string) => {
        const curr = colStatsMap.get(cId) || {
          totalRevenue: 0,
          totalUnits: 0,
          orders: new Set<string>(),
          vendorsSet: new Set<string>(),
          productsMap: new Map(),
        };

        curr.totalRevenue += rev;
        curr.totalUnits += qty;
        if (item.shopify_order_id) curr.orders.add(item.shopify_order_id);
        if (vendorName) curr.vendorsSet.add(vendorName);

        const prodKey = item.shopify_product_id || item.product_name;
        const currP = curr.productsMap.get(prodKey) || {
          productId: item.shopify_product_id || prodKey,
          title: item.product_name,
          units: 0,
          revenue: 0,
        };
        currP.units += qty;
        currP.revenue += rev;
        curr.productsMap.set(prodKey, currP);

        colStatsMap.set(cId, curr);
      });
    });

    const result = (collectionsResult.data || []).map((c: any) => {
      const stats = colStatsMap.get(c.shopify_collection_id);
      const rev = stats ? stats.totalRevenue : 0;
      const units = stats ? stats.totalUnits : 0;
      const orders = stats ? stats.orders.size : 0;
      const percent = globalRevenue > 0 ? (rev / globalRevenue) * 100 : 0;

      const topProducts = stats
        ? Array.from(stats.productsMap.values())
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 5)
            .map((p) => ({ ...p, revenue: Math.round(p.revenue * 100) / 100 }))
        : [];

      return {
        collectionId: c.shopify_collection_id,
        title: c.title,
        handle: c.handle,
        productsCount: c.products_count || 0,
        totalRevenue: Math.round(rev * 100) / 100,
        totalUnits: units,
        totalOrders: orders,
        percentOfTotal: Math.round(percent * 10) / 10,
        vendors: stats ? Array.from(stats.vendorsSet) : [],
        topProducts,
      };
    });

    result.sort((a: any, b: any) => b.totalRevenue - a.totalRevenue);

    const responseData = {
      collections: result,
      globalRevenue: Math.round(globalRevenue * 100) / 100,
    };

    // Cache for 90 seconds
    await setCache(cacheKey, responseData, 90);

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("[By Collection API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch collection breakdown", details: error.message },
      { status: 500 }
    );
  }
}
