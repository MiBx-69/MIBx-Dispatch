import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { format, parseISO } from "date-fns";
import { getOrderStatusMap, filterLineItemsByStatus, type OrderStatusFilter } from "@/lib/sales-status-helper";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ vendorName: string }> }
) {
  try {
    const { vendorName: rawVendorName } = await context.params;
    const vendorName = decodeURIComponent(rawVendorName).trim();
    const orderStatus = (request.nextUrl.searchParams.get("orderStatus") || "delivered") as OrderStatusFilter;

    const supabase = createServiceClient();

    // Fetch all line items for this vendor (matching trimmed and with whitespace)
    const { data: lineItems, error } = await supabase
      .from("shopify_line_items")
      .select(`
        shopify_order_id,
        shopify_product_id,
        product_name,
        vendor,
        quantity,
        price,
        sku,
        collection_ids,
        order_created_at
      `)
      .in("vendor", [vendorName, `${vendorName} `, `${vendorName}  `]);

    if (error) throw error;

    const rawItems = lineItems || [];

    // Filter by order delivery status (default: successfully delivered only)
    const { statusMap } = await getOrderStatusMap(supabase);
    const items = filterLineItemsByStatus(rawItems, statusMap, orderStatus);

    let totalRevenue = 0;
    let totalUnits = 0;
    const ordersSet = new Set<string>();
    const productsMap = new Map<
      string,
      {
        productId: string;
        title: string;
        sku: string | null;
        units: number;
        revenue: number;
        orders: Set<string>;
      }
    >();
    const timeSeriesMap = new Map<string, { revenue: number; units: number; orders: Set<string> }>();
    const collectionIdsSet = new Set<string>();

    items.forEach((item: any) => {
      const rev = Number(item.quantity) * Number(item.price);
      const qty = Number(item.quantity);

      totalRevenue += rev;
      totalUnits += qty;
      if (item.shopify_order_id) ordersSet.add(item.shopify_order_id);
      if (item.collection_ids) {
        item.collection_ids.forEach((id: string) => collectionIdsSet.add(id));
      }

      const prodKey = item.shopify_product_id || item.product_name;
      const currP = productsMap.get(prodKey) || {
        productId: item.shopify_product_id || prodKey,
        title: item.product_name,
        sku: item.sku || null,
        units: 0,
        revenue: 0,
        orders: new Set<string>(),
      };
      currP.units += qty;
      currP.revenue += rev;
      if (item.sku && !currP.sku) currP.sku = item.sku;
      if (item.shopify_order_id) currP.orders.add(item.shopify_order_id);
      productsMap.set(prodKey, currP);

      const day = item.order_created_at ? format(parseISO(item.order_created_at), "yyyy-MM-dd") : "unknown";
      if (day !== "unknown") {
        const currT = timeSeriesMap.get(day) || { revenue: 0, units: 0, orders: new Set<string>() };
        currT.revenue += rev;
        currT.units += qty;
        if (item.shopify_order_id) currT.orders.add(item.shopify_order_id);
        timeSeriesMap.set(day, currT);
      }
    });

    const totalOrders = ordersSet.size;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Fetch collections titles
    let collectionsList: Array<{ id: string; title: string }> = [];
    if (collectionIdsSet.size > 0) {
      const { data: cols } = await supabase
        .from("shopify_collections")
        .select("shopify_collection_id, title")
        .in("shopify_collection_id", Array.from(collectionIdsSet));
      collectionsList = (cols || []).map((c: any) => ({
        id: c.shopify_collection_id,
        title: c.title,
      }));
    }

    const allProducts = Array.from(productsMap.values()).map((p) => {
      const oCount = p.orders.size;
      const pAov = oCount > 0 ? p.revenue / oCount : 0;
      const pct = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
      return {
        productId: p.productId,
        title: p.title,
        sku: p.sku || "—",
        units: p.units,
        revenue: Math.round(p.revenue * 100) / 100,
        orders: oCount,
        aov: Math.round(pAov * 100) / 100,
        percent: Math.round(pct * 10) / 10,
      };
    });

    allProducts.sort((a, b) => b.revenue - a.revenue);
    const topProducts = allProducts.slice(0, 5);
    const bottomProducts = allProducts.slice().reverse().slice(0, 5);

    // Sorted TimeSeries
    const sortedDays = Array.from(timeSeriesMap.keys()).sort();
    const timeSeries = sortedDays.map((date) => {
      const entry = timeSeriesMap.get(date)!;
      return {
        date,
        displayDate: format(parseISO(date), "dd MMM"),
        revenue: Math.round(entry.revenue * 100) / 100,
        units: entry.units,
        orders: entry.orders.size,
      };
    });

    return NextResponse.json({
      vendor: {
        name: vendorName,
        metrics: {
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          totalUnits,
          totalOrders,
          aov: Math.round(aov * 100) / 100,
          productCount: productsMap.size,
        },
        products: allProducts,
        topProducts,
        bottomProducts,
        collections: collectionsList,
        timeSeries,
      },
    });
  } catch (error: any) {
    console.error("[Vendor Details API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch vendor details", details: error.message },
      { status: 500 }
    );
  }
}
