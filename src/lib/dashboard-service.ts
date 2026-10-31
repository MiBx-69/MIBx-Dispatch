import { createServiceClient } from "@/lib/supabase/server";
import { subDays, format, parseISO, differenceInDays } from "date-fns";
import { getUnifiedReportMetrics, resolveDateRange, formatBstDate } from "@/lib/reporting-engine";
import { getComprehensiveBusinessReport } from "@/lib/business-metrics-engine";
import { getCache, setCache, TTL } from "@/lib/redis";
import { normalizeProductTitle } from "@/lib/product-utils";
import { getOrderDisplayStatus } from "@/lib/order-status";

export async function getCachedDashboardData(dateFilter: string, customFrom?: string, customTo?: string) {
  const cacheKey = `dashboard:metrics:v2:${dateFilter}:${customFrom || ""}:${customTo || ""}`;
  const cached = await getCache<any>(cacheKey);
  if (cached) return cached;

  const supabase = createServiceClient();
  const unifiedMetrics = await getUnifiedReportMetrics({
    dateFilter,
    startDate: customFrom,
    endDate: customTo,
  });
  const { startDateStr: resolvedStart, endDateStr: resolvedEnd } = resolveDateRange(
    dateFilter,
    customFrom,
    customTo
  );
  const startDateStr = resolvedStart || subDays(new Date(), 30).toISOString();
  const endDateStr = resolvedEnd || new Date().toISOString();

  // Compute comprehensive report + previous period comparison
  const { report: comprehensiveReport, comparison } = await getComprehensiveBusinessReport(
    startDateStr,
    endDateStr,
    { includePreviousPeriod: true }
  );

  const { data: recentMonthOrders } = await supabase
    .from("orders")
    .select(
      "id, total_price, original_total_price, subtotal_price, original_subtotal_price, shopify_created_at, created_at, line_items, financial_status, fulfillment_status, internal_status, fraud_status"
    )
    .eq("is_archived", false)
    .gte("shopify_created_at", startDateStr)
    .lte("shopify_created_at", endDateStr)
    .order("shopify_created_at", { ascending: false });

  const orders = recentMonthOrders || [];

  const revenueMap = new Map<string, { total: number; subtotal: number }>();
  const daysDiff = Math.max(0, differenceInDays(parseISO(endDateStr), parseISO(startDateStr)));
  const spanDays = daysDiff < 7 ? 6 : Math.min(daysDiff, 90);
  for (let i = spanDays; i >= 0; i--) {
    const dayKey = formatBstDate(subDays(parseISO(endDateStr), i));
    revenueMap.set(dayKey, { total: 0, subtotal: 0 });
  }

  orders.forEach((o: any) => {
    if (o.internal_status === "cancelled" || o.internal_status === "returned") return;
    if (!o.shopify_created_at) return;
    const dateStr = formatBstDate(o.shopify_created_at);
    const current = revenueMap.get(dateStr) || { total: 0, subtotal: 0 };
    const origTotal = Number(o.original_total_price ?? o.total_price ?? 0);
    const origSub = Number(o.original_subtotal_price ?? o.subtotal_price ?? origTotal);
    revenueMap.set(dateStr, {
      total: current.total + origTotal,
      subtotal: current.subtotal + origSub,
    });
  });

  const revenueData = Array.from(revenueMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, data]) => ({
      date,
      displayDate: format(parseISO(date), "MMM d"),
      revenue: data.total,
      subtotal: data.subtotal,
    }));

  const productMap = new Map<
    string,
    { id: string; title: string; variant: string; qty: number; revenue: number }
  >();
  orders.forEach((o: any) => {
    if (o.internal_status === "cancelled") return;
    const items = o.line_items as any[];
    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        const rawTitle = item.title || item.name || "Unknown";
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
        const qty = Number(item.original_quantity ?? item.quantity ?? 1);
        p.qty += qty;
        p.revenue += (Number(item.price) || 0) * qty;
      });
    }
  });
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const { data: dispatchesInPeriod } = await supabase
    .from("dispatches")
    .select(
      "dispatched_at, is_cancelled, pathao_order_status, orders!inner(line_items, internal_status, is_archived)"
    )
    .gte("dispatched_at", startDateStr)
    .lte("dispatched_at", endDateStr)
    .eq("is_cancelled", false)
    .neq("orders.internal_status", "cancelled")
    .eq("orders.is_archived", false);

  const dispatchedPeriodMap = new Map<
    string,
    { id: string; title: string; variant: string; qty: number }
  >();
  if (dispatchesInPeriod) {
    dispatchesInPeriod.forEach((d: any) => {
      if (d.is_cancelled) return;
      if (d.pathao_order_status && d.pathao_order_status.toLowerCase().includes("cancel")) return;
      if (d.orders?.internal_status === "cancelled") return;
      if (d.orders?.is_archived) return;
      const items = d.orders?.line_items;
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          const rawTitle = item.title || item.name || "Unknown";
          const normalizedTitle = normalizeProductTitle(rawTitle);
          const key = normalizedTitle;
          if (!dispatchedPeriodMap.has(key)) {
            dispatchedPeriodMap.set(key, {
              id: key,
              title: normalizedTitle,
              variant: "Multiple Variations",
              qty: 0,
            });
          }
          dispatchedPeriodMap.get(key)!.qty += Number(item.original_quantity ?? item.quantity ?? 1);
        });
      }
    });
  }
  const topDispatchedPeriod = Array.from(dispatchedPeriodMap.values()).sort(
    (a, b) => b.qty - a.qty
  );

  const fStats = {
    unfulfilled: 0,
    partial: 0,
    fulfilled: 0,
    paid: 0,
    pending_payment: 0,
    total: orders.length,
  };
  const fraudStats = { safe: 0, risky: 0, fraud: 0 };
  const liveStats = {
    pending_orders: 0,
    preparing_orders: 0,
    dispatched_orders: 0,
    delivered_orders: 0,
    hold_orders: 0,
    orders_period: 0,
    dispatched_period: 0,
    cancelled_period: 0,
    returned_period: 0,
    returned_revenue: 0,
    revenue_period: 0,
    subtotal_period: 0,
  };

  let pendingCOD = 0;
  let deliveredCOD = 0;
  let returnedCOD = 0;

  orders.forEach((o: any) => {
    if (o.fulfillment_status === "fulfilled") fStats.fulfilled++;
    else if (o.fulfillment_status === "partial") fStats.partial++;
    else fStats.unfulfilled++;
    if (o.financial_status === "paid") fStats.paid++;
    else fStats.pending_payment++;
    if (o.fraud_status === "safe") fraudStats.safe++;
    else if (o.fraud_status === "risky") fraudStats.risky++;
    else if (o.fraud_status === "fraud") fraudStats.fraud++;

    const effectiveStatus = getOrderDisplayStatus(o);
    if (effectiveStatus === "pending") liveStats.pending_orders++;
    else if (effectiveStatus === "preparing") liveStats.preparing_orders++;
    else if (effectiveStatus === "dispatched") liveStats.dispatched_orders++;
    else if (effectiveStatus === "delivered") liveStats.delivered_orders++;
    else if (effectiveStatus === "hold") liveStats.hold_orders++;

    const origPrice = Number(o.original_total_price ?? o.total_price ?? 0);
    const origSub = Number(o.original_subtotal_price ?? o.subtotal_price ?? origPrice);

    liveStats.orders_period++;
    if (o.internal_status !== "cancelled" && o.internal_status !== "returned") {
      liveStats.revenue_period += origPrice;
      liveStats.subtotal_period += origSub;
    }
    if (o.internal_status === "cancelled") liveStats.cancelled_period++;
    if (o.internal_status === "returned") {
      liveStats.returned_period++;
      liveStats.returned_revenue += origPrice;
    }

    const st = o.internal_status;
    if (st === "dispatched") pendingCOD += origPrice;
    else if (st === "delivered") deliveredCOD += origPrice;
    else if (st === "returned") returnedCOD += origPrice;
  });
  liveStats.dispatched_period = unifiedMetrics.dispatchedCount;

  const { data: partialReturnsData } = await supabase
    .from("returns")
    .select("refund_amount, returned_product_value, returned_items, is_verified")
    .eq("return_type", "partial")
    .eq("is_verified", true)
    .gte("returned_at", startDateStr)
    .lte("returned_at", endDateStr);

  const partialDeductions = (partialReturnsData || []).reduce((acc: number, r: any) => {
    const val =
      Number(r.returned_product_value) ||
      Number(r.refund_amount) ||
      (Array.isArray(r.returned_items) &&
        r.returned_items.reduce(
          (s: number, i: any) =>
            s + Number(i.price || 0) * Number(i.return_quantity ?? i.quantity ?? 0),
          0
        )) ||
      0;
    return acc + val;
  }, 0);

  liveStats.returned_revenue += partialDeductions;
  returnedCOD += partialDeductions;
  deliveredCOD = Math.max(0, deliveredCOD - partialDeductions);

  const result = {
    unifiedMetrics,
    comprehensiveReport,
    comparison,
    revenueData,
    topProducts,
    topDispatchedPeriod,
    fStats,
    fraudStats,
    liveStats,
    pendingCOD,
    deliveredCOD,
    returnedCOD,
  };

  await setCache(cacheKey, result, TTL.DASHBOARD_STATS);
  return result;
}
