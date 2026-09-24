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
    const products = searchParams.getAll("products[]").concat(searchParams.get("products")?.split(",").filter(Boolean) || []);
    const search = searchParams.get("search")?.trim().toLowerCase() || "";
    const noCache = searchParams.get("refresh") === "true";

    // Cache key
    const cacheParams = {
      startDate, endDate, orderStatus,
      vendors: vendors.sort(), collections: collections.sort(),
      products: products.sort(), search,
    };
    const cacheKey = `sales:vendor:${Buffer.from(JSON.stringify(cacheParams)).toString("base64").substring(0, 64)}`;

    if (!noCache) {
      const cached = await getCache<any>(cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    const supabase = createServiceClient();

    let query = supabase.from("shopify_line_items").select(`
      shopify_order_id,
      shopify_product_id,
      product_name,
      vendor,
      quantity,
      price,
      sku,
      collection_ids,
      order_created_at
    `);

    if (startDate) query = query.gte("order_created_at", startDate);
    if (endDate) query = query.lte("order_created_at", endDate);
    if (vendors.length > 0) query = query.in("vendor", vendors);
    if (collections.length > 0) query = query.overlaps("collection_ids", collections);
    if (products.length > 0) query = query.in("shopify_product_id", products);

    const [lineItemsResult, statusInfo, productsResult] = await Promise.all([
      query,
      getOrderStatusMap(supabase),
      supabase.from("shopify_products").select("shopify_product_id, vendor"),
    ]);

    if (lineItemsResult.error) throw lineItemsResult.error;

    const productVendorMap = new Map<string, string>();
    (productsResult.data || []).forEach((p: any) => {
      if (p.vendor) productVendorMap.set(p.shopify_product_id, p.vendor.trim());
    });

    let rawItems = lineItemsResult.data || [];

    // Filter by order delivery status (default: successfully delivered only)
    let items = filterLineItemsByStatus(rawItems, statusInfo.statusMap, orderStatus);

    if (search) {
      items = items.filter(
        (i: any) =>
          i.vendor?.toLowerCase().includes(search) ||
          i.product_name?.toLowerCase().includes(search) ||
          i.sku?.toLowerCase().includes(search)
      );
    }

    let globalRevenue = 0;
    const vendorMap = new Map<
      string,
      {
        vendor: string;
        totalRevenue: number;
        totalUnits: number;
        orders: Set<string>;
        productsMap: Map<string, { productId: string; title: string; sku: string | null; units: number; revenue: number }>;
        collectionsSet: Set<string>;
      }
    >();

    items.forEach((item: any) => {
      // Prioritize current product vendor over historical line item vendor
      const currentVendor = item.shopify_product_id ? productVendorMap.get(item.shopify_product_id) : null;
      const vendorName = (currentVendor || item.vendor || "Default Vendor").trim();
      
      const rev = Number(item.quantity) * Number(item.price);
      const qty = Number(item.quantity);

      globalRevenue += rev;

      const curr = vendorMap.get(vendorName) || {
        vendor: vendorName,
        totalRevenue: 0,
        totalUnits: 0,
        orders: new Set<string>(),
        productsMap: new Map(),
        collectionsSet: new Set<string>(),
      };

      curr.totalRevenue += rev;
      curr.totalUnits += qty;
      if (item.shopify_order_id) curr.orders.add(item.shopify_order_id);
      if (item.collection_ids) {
        item.collection_ids.forEach((cId: string) => curr.collectionsSet.add(cId));
      }

      const prodKey = item.shopify_product_id || item.product_name;
      const currP = curr.productsMap.get(prodKey) || {
        productId: item.shopify_product_id || prodKey,
        title: item.product_name,
        sku: item.sku || null,
        units: 0,
        revenue: 0,
      };
      currP.units += qty;
      currP.revenue += rev;
      curr.productsMap.set(prodKey, currP);

      vendorMap.set(vendorName, curr);
    });

    const vendorList = Array.from(vendorMap.values()).map((v) => {
      const orderCount = v.orders.size;
      const aov = orderCount > 0 ? v.totalRevenue / orderCount : 0;
      const percentShare = globalRevenue > 0 ? (v.totalRevenue / globalRevenue) * 100 : 0;

      const allProducts = Array.from(v.productsMap.values()).sort((a, b) => b.revenue - a.revenue);
      const topProducts = allProducts.slice(0, 5).map((p) => ({
        ...p,
        revenue: Math.round(p.revenue * 100) / 100,
      }));

      return {
        name: v.vendor,
        totalRevenue: Math.round(v.totalRevenue * 100) / 100,
        totalUnits: v.totalUnits,
        totalOrders: orderCount,
        aov: Math.round(aov * 100) / 100,
        percentShare: Math.round(percentShare * 10) / 10,
        productCount: v.productsMap.size,
        collectionCount: v.collectionsSet.size,
        topProducts,
        allProducts: allProducts.map((p) => ({
          ...p,
          revenue: Math.round(p.revenue * 100) / 100,
        })),
      };
    });

    vendorList.sort((a, b) => b.totalRevenue - a.totalRevenue);

    const responseData = {
      vendors: vendorList,
      globalRevenue: Math.round(globalRevenue * 100) / 100,
      totalVendors: vendorList.length,
    };

    // Cache for 90 seconds
    await setCache(cacheKey, responseData, 90);

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("[By Vendor API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch vendor breakdown", details: error.message },
      { status: 500 }
    );
  }
}
