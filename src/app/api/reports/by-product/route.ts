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

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));
    const sortBy = searchParams.get("sortBy") || "revenue";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    const noCache = searchParams.get("refresh") === "true";

    // Cache key
    const cacheParams = {
      startDate, endDate, orderStatus,
      vendors: vendors.sort(), collections: collections.sort(),
      products: products.sort(), search,
      page, limit, sortBy, sortOrder,
    };
    const cacheKey = `sales:product:${Buffer.from(JSON.stringify(cacheParams)).toString("base64").substring(0, 64)}`;

    if (!noCache) {
      const cached = await getCache<any>(cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    const supabase = createServiceClient();

    // 1. Fetch Line Items + Collections + Products in parallel
    let query = supabase.from("shopify_line_items").select(`
      shopify_order_id,
      shopify_product_id,
      product_name,
      vendor,
      variant_id,
      variant_title,
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

    // Run line items query + metadata queries + status map in parallel
    const [lineItemsResult, collectionsResult, productsResult, statusInfo] = await Promise.all([
      query,
      supabase.from("shopify_collections").select("shopify_collection_id, title"),
      supabase.from("shopify_products").select("shopify_product_id, title, vendor, image_url, collections"),
      getOrderStatusMap(supabase),
    ]);

    if (lineItemsResult.error) throw lineItemsResult.error;

    const collectionMap = new Map<string, string>();
    (collectionsResult.data || []).forEach((c: any) => collectionMap.set(c.shopify_collection_id, c.title));

    const productMap = new Map<string, any>();
    (productsResult.data || []).forEach((p: any) => productMap.set(p.shopify_product_id, p));

    // Filter by order status
    let items = filterLineItemsByStatus(lineItemsResult.data || [], statusInfo.statusMap, orderStatus);

    if (search) {
      items = items.filter(
        (i: any) =>
          i.product_name?.toLowerCase().includes(search) ||
          i.vendor?.toLowerCase().includes(search) ||
          i.sku?.toLowerCase().includes(search) ||
          i.variant_title?.toLowerCase().includes(search)
      );
    }

    // 3. Group by Product
    let totalRevenue = 0;
    let totalUnits = 0;
    const globalOrders = new Set<string>();

    const prodGroupMap = new Map<
      string,
      {
        id: string;
        shopifyProductId: string | null;
        name: string;
        sku: string | null;
        vendor: string;
        collections: string[];
        imageUrl: string | null;
        unitsSold: number;
        totalRevenue: number;
        orders: Set<string>;
      }
    >();

    items.forEach((item: any) => {
      const prodKey = item.shopify_product_id || item.product_name;
      const rev = Number(item.quantity) * Number(item.price);
      const qty = Number(item.quantity);

      totalRevenue += rev;
      totalUnits += qty;
      if (item.shopify_order_id) globalOrders.add(item.shopify_order_id);

      const prodMeta = item.shopify_product_id ? productMap.get(item.shopify_product_id) : null;
      let collectionTitles: string[] = [];
      if (prodMeta?.collections) {
        collectionTitles = prodMeta.collections.map((c: any) => c.title);
      } else if (item.collection_ids?.length) {
        collectionTitles = item.collection_ids.map((id: string) => collectionMap.get(id) || id);
      }

      const curr = prodGroupMap.get(prodKey) || {
        id: prodKey,
        shopifyProductId: item.shopify_product_id || null,
        name: item.product_name,
        sku: item.sku || null,
        vendor: (prodMeta?.vendor || item.vendor || "Default Vendor").trim(),
        collections: collectionTitles,
        imageUrl: prodMeta?.image_url || null,
        unitsSold: 0,
        totalRevenue: 0,
        orders: new Set<string>(),
      };

      curr.unitsSold += qty;
      curr.totalRevenue += rev;
      if (item.sku && !curr.sku) curr.sku = item.sku;
      if (item.shopify_order_id) curr.orders.add(item.shopify_order_id);

      prodGroupMap.set(prodKey, curr);
    });

    const productRows = Array.from(prodGroupMap.values()).map((p) => {
      const orderCount = p.orders.size;
      const aov = orderCount > 0 ? p.totalRevenue / orderCount : 0;
      const percent = totalRevenue > 0 ? (p.totalRevenue / totalRevenue) * 100 : 0;

      return {
        id: p.id,
        productId: p.shopifyProductId,
        name: p.name,
        sku: p.sku || "—",
        vendor: p.vendor,
        collections: p.collections,
        imageUrl: p.imageUrl,
        unitsSold: p.unitsSold,
        totalRevenue: Math.round(p.totalRevenue * 100) / 100,
        orderCount,
        aov: Math.round(aov * 100) / 100,
        percentOfTotal: Math.round(percent * 10) / 10,
      };
    });

    // Sort
    productRows.sort((a, b) => {
      let aVal: any = a.totalRevenue;
      let bVal: any = b.totalRevenue;

      if (sortBy === "units") {
        aVal = a.unitsSold;
        bVal = b.unitsSold;
      } else if (sortBy === "orders") {
        aVal = a.orderCount;
        bVal = b.orderCount;
      } else if (sortBy === "name") {
        aVal = a.name.toLowerCase();
        bVal = b.name.toLowerCase();
      } else if (sortBy === "aov") {
        aVal = a.aov;
        bVal = b.aov;
      } else if (sortBy === "sku") {
        aVal = (a.sku || "").toLowerCase();
        bVal = (b.sku || "").toLowerCase();
      } else if (sortBy === "vendor") {
        aVal = (a.vendor || "").toLowerCase();
        bVal = (b.vendor || "").toLowerCase();
      }

      if (sortOrder === "asc") {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    const totalRows = productRows.length;
    const totalPages = Math.ceil(totalRows / limit);
    const paginatedRows = productRows.slice((page - 1) * limit, page * limit);

    const responseData = {
      products: paginatedRows,
      totals: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalUnits,
        totalOrders: globalOrders.size,
        aov: globalOrders.size > 0 ? Math.round((totalRevenue / globalOrders.size) * 100) / 100 : 0,
      },
      pagination: {
        page,
        limit,
        totalRows,
        totalPages,
      },
    };

    // Cache for 90 seconds
    await setCache(cacheKey, responseData, 90);

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("[By Product API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch product breakdown", details: error.message },
      { status: 500 }
    );
  }
}
