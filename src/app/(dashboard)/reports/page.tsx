import { createServiceClient } from "@/lib/supabase/server";
import { format, parseISO, subDays } from "date-fns";
import { ReportsClient } from "./reports-client";
import { resolveDateRange, formatBstDate, getUnifiedReportMetrics } from "@/lib/reporting-engine";
import { normalizeProductTitle } from "@/lib/product-utils";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ startDate?: string; endDate?: string; filterType?: string }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();

  const filterType = params.filterType || (params.startDate && params.endDate ? "custom" : "last_30_days");
  const { startDateStr, endDateStr } = resolveDateRange(filterType, params.startDate, params.endDate);
  
  const finalStart = startDateStr || subDays(new Date(), 30).toISOString();
  const finalEnd = endDateStr || new Date().toISOString();

  // 1. Fetch settings
  const { data: settings } = await supabase.from("app_settings").select("company_name, system_name").single();

  // 2. Fetch Orders in date range (exclude archived)
  const { data: ordersData } = await supabase
    .from("orders")
    .select("total_price, subtotal_price, shopify_created_at, created_at, line_items, financial_status, fulfillment_status, internal_status, fraud_status, returned_at, return_reason, return_delivery_fee, pathao_consignment_id")
    .eq("is_archived", false)
    .gte("shopify_created_at", finalStart)
    .lte("shopify_created_at", finalEnd)
    .order("shopify_created_at", { ascending: false });

  const orders = ordersData || [];

  // 3. Fetch Dispatches in date range (exclude cancelled & archived)
  const { data: dispatchesData } = await supabase
    .from("dispatches")
    .select("dispatched_at, is_cancelled, pathao_order_status, amount_to_collect, orders!inner(line_items, total_price, internal_status, is_archived)")
    .gte("dispatched_at", finalStart)
    .lte("dispatched_at", finalEnd)
    .eq("is_cancelled", false)
    .neq("orders.internal_status", "cancelled")
    .eq("orders.is_archived", false);
    
  const dispatches = (dispatchesData || []).filter((d: any) => {
    if (d.is_cancelled) return false;
    if (d.pathao_order_status && d.pathao_order_status.toLowerCase().includes("cancel")) return false;
    if (d.orders?.internal_status === "cancelled") return false;
    if (d.orders?.is_archived) return false;
    return true;
  });

  // 4. Fetch Returns in date range
  const { data: returnsData } = await supabase
    .from("returns")
    .select("id, order_total, return_delivery_fee, returned_at, return_reason, return_source, return_type, is_verified, refund_amount, returned_items")
    .gte("returned_at", finalStart)
    .lte("returned_at", finalEnd);

  const returns = returnsData || [];

  // --- Process Data for Charts & Breakdowns ---

  // A. Revenue Data bucketed in BST (Asia/Dhaka)
  const revenueMap = new Map<string, { total: number; subtotal: number }>();
  const startBst = formatBstDate(finalStart);
  const endBst = formatBstDate(finalEnd);
  
  let curr = new Date(`${startBst}T12:00:00+06:00`);
  const endLimit = new Date(`${endBst}T12:00:00+06:00`);
  let loopCount = 0;
  while (curr <= endLimit && loopCount < 366) {
    revenueMap.set(formatBstDate(curr), { total: 0, subtotal: 0 });
    curr.setDate(curr.getDate() + 1);
    loopCount++;
  }

  let totalGross = 0;
  let totalSubtotal = 0;

  orders.forEach((o: any) => {
    if (!o.shopify_created_at) return;
    const dateStr = formatBstDate(o.shopify_created_at);
    
    const orderTotal = Number(o.total_price) || 0;
    const orderSubtotal = Number(o.subtotal_price) || 0;
    
    totalGross += orderTotal;
    totalSubtotal += orderSubtotal;

    if (revenueMap.has(dateStr)) {
      const current = revenueMap.get(dateStr)!;
      revenueMap.set(dateStr, {
        total: current.total + orderTotal,
        subtotal: current.subtotal + orderSubtotal,
      });
    } else {
      revenueMap.set(dateStr, {
        total: orderTotal,
        subtotal: orderSubtotal,
      });
    }
  });

  const revenueData = Array.from(revenueMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => ({ 
      date, 
      displayDate: format(parseISO(date), "MMM d"),
      revenue: data.total,
      subtotal: data.subtotal,
    }));

  // B. Top Selling Products
  const productMap = new Map<string, { id: string; title: string; variant: string; qty: number; revenue: number }>();
  orders.forEach((o: any) => {
    const items = o.line_items as any[];
    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        const rawTitle = item.title || item.name || "Unknown Product";
        const normalizedTitle = normalizeProductTitle(rawTitle);
        const key = normalizedTitle;
        if (!productMap.has(key)) {
          productMap.set(key, { 
            id: key, 
            title: normalizedTitle, 
            variant: "Multiple Variations", 
            qty: 0, 
            revenue: 0,
          });
        }
        const p = productMap.get(key)!;
        p.qty += item.quantity || 1;
        p.revenue += (Number(item.price) || 0) * (item.quantity || 1);
      });
    }
  });
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // C. Dispatched Products (Quantity)
  const dispatchedMap = new Map<string, { id: string; title: string; variant: string; qty: number }>();
  dispatches.forEach((d: any) => {
    const items = d.orders?.line_items;
    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        const rawTitle = item.title || item.name || "Unknown Product";
        const normalizedTitle = normalizeProductTitle(rawTitle);
        const key = normalizedTitle;
        if (!dispatchedMap.has(key)) {
          dispatchedMap.set(key, { 
            id: key, 
            title: normalizedTitle, 
            variant: "Multiple Variations", 
            qty: 0,
          });
        }
        dispatchedMap.get(key)!.qty += item.quantity || 1;
      });
    }
  });
  const topDispatched = Array.from(dispatchedMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // D. Fully reconciled metrics for orders in this period
  const deliveredOrders = orders.filter((o: any) => o.internal_status === "delivered");
  const returnedOrders = orders.filter((o: any) => o.internal_status === "returned");
  const cancelledOrders = orders.filter((o: any) => o.internal_status === "cancelled");
  const inTransitOrders = orders.filter(
    (o: any) =>
      ["dispatched", "in_transit"].includes(o.internal_status) ||
      (o.pathao_consignment_id && !["delivered", "returned", "cancelled"].includes(o.internal_status))
  );

  const deliveredRevenue = deliveredOrders.reduce((acc: number, o: any) => acc + (Number(o.total_price) || 0), 0);
  const cancelledRevenue = cancelledOrders.reduce((acc: number, o: any) => acc + (Number(o.total_price) || 0), 0);
  const pendingDeliveryAmount = inTransitOrders.reduce((acc: number, o: any) => acc + (Number(o.total_price) || 0), 0);
  const returnedRevenue = returnedOrders.reduce((acc: number, o: any) => acc + (Number(o.total_price) || 0), 0);

  const dispatchedOrders = orders.filter(
    (o: any) => o.pathao_consignment_id || ["dispatched", "delivered", "returned"].includes(o.internal_status)
  );
  const dispatchedOrdersCount = dispatchedOrders.length || dispatches.length;

  const totalDispatchedAmount = dispatchedOrders.reduce(
    (acc: number, o: any) => acc + (Number(o.total_price) || 0),
    0
  );

  // Success rate = Delivered / (Delivered + Returned) * 100
  const totalFinalizedOrders = deliveredOrders.length + returnedOrders.length;
  const successRate = totalFinalizedOrders > 0
    ? Math.round((deliveredOrders.length / totalFinalizedOrders) * 100)
    : deliveredOrders.length > 0 ? 100 : 0;

  // General Order Stats
  const orderStats = {
    totalOrders: orders.length,
    dispatchedOrders: dispatchedOrdersCount,
    deliveredOrders: deliveredOrders.length,
    cancelledOrders: cancelledOrders.length,
    returnedOrders: returnedOrders.length,
  };

  const unifiedMetrics = await getUnifiedReportMetrics({
    dateFilter: filterType,
    startDate: params.startDate || finalStart,
    endDate: params.endDate || finalEnd,
  });

  return (
    <ReportsClient 
      revenueData={revenueData}
      topProducts={topProducts}
      topDispatched={topDispatched}
      orderStats={orderStats}
      totalGross={totalGross}
      totalSubtotal={totalSubtotal}
      totalDispatchedAmount={totalDispatchedAmount}
      returnedRevenue={returnedRevenue}
      cancelledRevenue={cancelledRevenue}
      deliveredRevenue={deliveredRevenue}
      pendingDeliveryAmount={pendingDeliveryAmount}
      successRate={successRate}
      companyName={settings?.company_name || "MiBx"}
      systemName={settings?.system_name || "MiBx Dispatch"}
      initialStartDate={finalStart}
      initialEndDate={finalEnd}
      initialFilterType={filterType}
      unifiedMetrics={unifiedMetrics}
    />
  );
}
