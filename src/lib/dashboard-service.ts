import { createServiceClient } from "@/lib/supabase/server";
import { subDays, format, parseISO, differenceInDays } from "date-fns";
import { getUnifiedReportMetrics, resolveDateRange } from "@/lib/reporting-engine";
import { getCache, setCache, TTL } from "@/lib/redis";
import { normalizeProductTitle } from "@/lib/product-utils";
import { getOrderDisplayStatus } from "@/lib/order-status";

export async function getCachedDashboardData(dateFilter: string) {
  const cacheKey = `dashboard:metrics:v1:${dateFilter}`;
  const cached = await getCache<any>(cacheKey);
  if (cached) return cached;

  const supabase = createServiceClient();
  const unifiedMetrics = await getUnifiedReportMetrics({ dateFilter });
  const { startDateStr: resolvedStart, endDateStr: resolvedEnd } = resolveDateRange(dateFilter);
  let startDateStr = resolvedStart || subDays(new Date(), 30).toISOString();
  let endDateStr = resolvedEnd || new Date().toISOString();

  const MIN_DATE = new Date("2026-08-31T18:00:00.000Z");
  if (new Date(startDateStr) < MIN_DATE) {
    startDateStr = MIN_DATE.toISOString();
  }

  const { data: recentMonthOrders } = await supabase
    .from("orders")
    .select("total_price, subtotal_price, shopify_created_at, created_at, line_items, financial_status, fulfillment_status, internal_status, fraud_status")
    .gte("shopify_created_at", startDateStr)
    .lte("shopify_created_at", endDateStr)
    .order("shopify_created_at", { ascending: false });

  const orders = recentMonthOrders || [];
  
  const revenueMap = new Map<string, { total: number, subtotal: number }>();
  let daysDiff = differenceInDays(parseISO(endDateStr), parseISO(startDateStr));
  if (daysDiff < 7) {
     for (let i = 6; i >= 0; i--) {
        revenueMap.set(format(subDays(parseISO(endDateStr), i), 'yyyy-MM-dd'), { total: 0, subtotal: 0 });
     }
  } else {
     for (let i = daysDiff; i >= 0; i--) {
        revenueMap.set(format(subDays(parseISO(endDateStr), i), 'yyyy-MM-dd'), { total: 0, subtotal: 0 });
     }
  }
  
  orders.forEach((o: any) => {
    if (o.internal_status === 'cancelled' || o.internal_status === 'returned') return;
    if (!o.shopify_created_at) return;
    const dateStr = format(parseISO(o.shopify_created_at), 'yyyy-MM-dd');
    if (revenueMap.has(dateStr)) {
      const current = revenueMap.get(dateStr)!;
      revenueMap.set(dateStr, {
        total: current.total + (Number(o.total_price) || 0),
        subtotal: current.subtotal + (Number(o.subtotal_price) || 0)
      });
    }
  });
  const revenueData = Array.from(revenueMap.entries()).map(([date, data]) => ({ 
    date, displayDate: format(parseISO(date), "MMM d"), revenue: data.total, subtotal: data.subtotal
  }));

  const productMap = new Map<string, { id: string, title: string, variant: string, qty: number, revenue: number }>();
  orders.forEach((o: any) => {
    const items = o.line_items as any[];
    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        const rawTitle = item.title || item.name || 'Unknown';
        const normalizedTitle = normalizeProductTitle(rawTitle);
        const key = normalizedTitle;
        if (!productMap.has(key)) {
          productMap.set(key, { id: key, title: normalizedTitle, variant: 'Multiple Variations', qty: 0, revenue: 0 });
        }
        const p = productMap.get(key)!;
        p.qty += item.quantity || 1;
        p.revenue += (Number(item.price) || 0) * (item.quantity || 1);
      });
    }
  });
  const topProducts = Array.from(productMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);

  const { data: dispatchesInPeriod } = await supabase
    .from("dispatches")
    .select("dispatched_at, is_cancelled, pathao_order_status, orders!inner(line_items, internal_status, is_archived)")
    .gte("dispatched_at", startDateStr)
    .lte("dispatched_at", endDateStr)
    .eq("is_cancelled", false)
    .neq("orders.internal_status", "cancelled")
    .eq("orders.is_archived", false);

  const dispatchedPeriodMap = new Map<string, { id: string, title: string, variant: string, qty: number }>();
  if (dispatchesInPeriod) {
    dispatchesInPeriod.forEach((d: any) => {
      if (d.is_cancelled) return;
      if (d.pathao_order_status && d.pathao_order_status.toLowerCase().includes("cancel")) return;
      if (d.orders?.internal_status === "cancelled") return;
      if (d.orders?.is_archived) return;
      const items = d.orders?.line_items;
      if (Array.isArray(items)) {
        items.forEach((item: any) => {
          const rawTitle = item.title || item.name || 'Unknown';
          const normalizedTitle = normalizeProductTitle(rawTitle);
          const key = normalizedTitle;
          if (!dispatchedPeriodMap.has(key)) {
            dispatchedPeriodMap.set(key, { id: key, title: normalizedTitle, variant: 'Multiple Variations', qty: 0 });
          }
          dispatchedPeriodMap.get(key)!.qty += item.quantity || 1;
        });
      }
    });
  }
  const topDispatchedPeriod = Array.from(dispatchedPeriodMap.values()).sort((a, b) => b.qty - a.qty);

  const fStats = { unfulfilled: 0, partial: 0, fulfilled: 0, paid: 0, pending_payment: 0, total: orders.length };
  const fraudStats = { safe: 0, risky: 0, fraud: 0 };
  const liveStats = { pending_orders: 0, preparing_orders: 0, dispatched_orders: 0, delivered_orders: 0, hold_orders: 0, orders_period: 0, dispatched_period: 0, cancelled_period: 0, returned_period: 0, returned_revenue: 0, revenue_period: 0, subtotal_period: 0 };

  let pendingCOD = 0; let deliveredCOD = 0; let returnedCOD = 0;
  orders.forEach((o: any) => {
    if (o.fulfillment_status === 'fulfilled') fStats.fulfilled++;
    else if (o.fulfillment_status === 'partial') fStats.partial++;
    else fStats.unfulfilled++;
    if (o.financial_status === 'paid') fStats.paid++;
    else fStats.pending_payment++;
    if (o.fraud_status === 'safe') fraudStats.safe++;
    else if (o.fraud_status === 'risky') fraudStats.risky++;
    else if (o.fraud_status === 'fraud') fraudStats.fraud++;

    const effectiveStatus = getOrderDisplayStatus(o);
    if (effectiveStatus === 'pending') liveStats.pending_orders++;
    else if (effectiveStatus === 'preparing') liveStats.preparing_orders++;
    else if (effectiveStatus === 'dispatched') liveStats.dispatched_orders++;
    else if (effectiveStatus === 'delivered') liveStats.delivered_orders++;
    else if (effectiveStatus === 'hold') liveStats.hold_orders++;

    liveStats.orders_period++;
    if (o.internal_status !== 'cancelled' && o.internal_status !== 'returned') {
      liveStats.revenue_period += Number(o.total_price) || 0;
      liveStats.subtotal_period += Number(o.subtotal_price) || 0;
    }
    if (o.internal_status === 'cancelled') liveStats.cancelled_period++;
    if (o.internal_status === 'returned') {
      liveStats.returned_period++;
      liveStats.returned_revenue += Number(o.total_price) || 0;
    }

    const st = o.internal_status;
    if (st === "dispatched") pendingCOD += Number(o.total_price);
    else if (st === "delivered") deliveredCOD += Number(o.total_price);
    else if (st === "returned") returnedCOD += Number(o.total_price);
  });
  liveStats.dispatched_period = unifiedMetrics.dispatchedCount;

  const { data: partialReturnsData } = await supabase
    .from("returns")
    .select("refund_amount, order_total, returned_items")
    .eq("return_type", "partial")
    .gte("returned_at", startDateStr)
    .lte("returned_at", endDateStr);

  const partialDeductions = (partialReturnsData || []).reduce((acc: number, r: any) => {
    const val = Number(r.refund_amount) || 
      (Array.isArray(r.returned_items) && r.returned_items.reduce((s: number, i: any) => s + (Number(i.price || 0) * Number(i.quantity || 1)), 0)) ||
      (Number(r.order_total) || 0);
    return acc + val;
  }, 0);
  liveStats.returned_revenue += partialDeductions;
  returnedCOD += partialDeductions;

  const result = {
    unifiedMetrics,
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
