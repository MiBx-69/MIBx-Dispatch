import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { format, parseISO } from "date-fns";
import { getOrderStatusMap, filterLineItemsByStatus, type OrderStatusFilter } from "@/lib/sales-status-helper";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const orderStatus = (searchParams.get("orderStatus") || "delivered") as OrderStatusFilter;
    const compareType = searchParams.get("type") || "vendor"; // "vendor" or "product"
    const compareEntities = searchParams
      .getAll("entities[]")
      .concat(searchParams.get("entities")?.split(",").filter(Boolean) || []);

    const supabase = createServiceClient();

    let query = supabase.from("shopify_line_items").select(`
      shopify_order_id,
      shopify_product_id,
      product_name,
      vendor,
      quantity,
      price,
      order_created_at
    `);

    if (startDate) query = query.gte("order_created_at", startDate);
    if (endDate) query = query.lte("order_created_at", endDate);

    if (compareType === "vendor" && compareEntities.length > 0) {
      const vendorPermutations = compareEntities.flatMap((v) => [v, `${v} `, v.trim()]);
      query = query.in("vendor", vendorPermutations);
    } else if (compareType === "product" && compareEntities.length > 0) {
      query = query.in("shopify_product_id", compareEntities);
    }

    const { data: lineItems, error } = await query;
    if (error) throw error;

    const rawItems = lineItems || [];

    // Filter by order delivery status (default: successfully delivered only)
    const { statusMap } = await getOrderStatusMap(supabase);
    const items = filterLineItemsByStatus(rawItems, statusMap, orderStatus);

    // Group by entity and daily time-series
    const entityMap = new Map<
      string,
      {
        name: string;
        totalRevenue: number;
        totalUnits: number;
        orders: Set<string>;
        dailyMap: Map<string, number>;
      }
    >();

    const allDates = new Set<string>();

    items.forEach((item: any) => {
      const key = compareType === "vendor" ? item.vendor || "Default" : item.product_name;
      const rev = Number(item.quantity) * Number(item.price);
      const qty = Number(item.quantity);

      const curr = entityMap.get(key) || {
        name: key,
        totalRevenue: 0,
        totalUnits: 0,
        orders: new Set<string>(),
        dailyMap: new Map<string, number>(),
      };

      curr.totalRevenue += rev;
      curr.totalUnits += qty;
      if (item.shopify_order_id) curr.orders.add(item.shopify_order_id);

      const day = item.order_created_at ? format(parseISO(item.order_created_at), "yyyy-MM-dd") : null;
      if (day) {
        allDates.add(day);
        const dayRev = (curr.dailyMap.get(day) || 0) + rev;
        curr.dailyMap.set(day, dayRev);
      }

      entityMap.set(key, curr);
    });

    const entitiesSummary = Array.from(entityMap.values()).map((e) => ({
      name: e.name,
      totalRevenue: Math.round(e.totalRevenue * 100) / 100,
      totalUnits: e.totalUnits,
      totalOrders: e.orders.size,
      aov: e.orders.size > 0 ? Math.round((e.totalRevenue / e.orders.size) * 100) / 100 : 0,
    }));

    // Overlaid time series: [{ date, displayDate, 'Vendor A': 1200, 'Vendor B': 800 }]
    const sortedDates = Array.from(allDates).sort();
    const overlaidTimeSeries = sortedDates.map((date) => {
      const point: Record<string, any> = {
        date,
        displayDate: format(parseISO(date), "dd MMM"),
      };
      entityMap.forEach((e, name) => {
        point[name] = Math.round((e.dailyMap.get(date) || 0) * 100) / 100;
      });
      return point;
    });

    return NextResponse.json({
      compareType,
      entities: entitiesSummary,
      entitiesSummary,
      timeSeries: overlaidTimeSeries,
      overlaidTimeSeries,
    });
  } catch (error: any) {
    console.error("[Compare API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch comparison data", details: error.message },
      { status: 500 }
    );
  }
}
