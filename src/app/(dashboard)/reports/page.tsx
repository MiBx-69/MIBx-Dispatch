import { createServiceClient } from "@/lib/supabase/server";
import { format, parseISO, differenceInDays, subDays } from "date-fns";
import { ReportsClient } from "./reports-client";
import { getUnifiedReportMetrics } from "@/lib/reporting-engine";
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

  const now = new Date();
  const MIN_DATE = new Date("2026-08-31T18:00:00.000Z"); // Sept 1st 00:00 BST
  
  // Default to Last 30 Days if no dates provided
  let startDateStr = params.startDate || subDays(now, 30).toISOString();
  let endDateStr = params.endDate || now.toISOString();

  // Enforce minimum date of September 1, 2026 for accurate reporting
  if (new Date(startDateStr) < MIN_DATE) {
    startDateStr = MIN_DATE.toISOString();
  }
  if (new Date(endDateStr) < MIN_DATE) {
    endDateStr = MIN_DATE.toISOString();
  }

  // 1. Fetch Orders in date range
  const { data: ordersData } = await supabase
    .from("orders")
    .select("total_price, subtotal_price, shopify_created_at, created_at, line_items, financial_status, fulfillment_status, internal_status, fraud_status, returned_at, return_reason, return_delivery_fee")
    .gte("shopify_created_at", startDateStr)
    .lte("shopify_created_at", endDateStr)
    .order("shopify_created_at", { ascending: false });

  const orders = ordersData || [];

  // 2. Fetch Dispatches in date range
  const { data: dispatchesData } = await supabase
    .from("dispatches")
    .select("dispatched_at, is_cancelled, orders(line_items, total_price)")
    .gte("dispatched_at", startDateStr)
    .lte("dispatched_at", endDateStr)
    .eq("is_cancelled", false);
    
  const dispatches = dispatchesData || [];

  // 3. Fetch Returns in date range (from returns table for accurate fee tracking)
  const { data: returnsData } = await supabase
    .from("returns")
    .select("id, order_total, return_delivery_fee, returned_at, return_reason, return_source, return_type, is_verified, refund_amount, returned_items")
    .gte("returned_at", startDateStr)
    .lte("returned_at", endDateStr);

  const returns = returnsData || [];

  // --- Process Data for Charts ---

  // A. Revenue Data (now excludes cancelled AND returned)
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

  let totalGross = 0;
  let totalSubtotal = 0;

  orders.forEach((o: any) => {
    if (!o.shopify_created_at) return;
    const dateStr = format(parseISO(o.shopify_created_at), 'yyyy-MM-dd');
    
    const orderTotal = Number(o.total_price) || 0;
    const orderSubtotal = Number(o.subtotal_price) || 0;
    
    // Count ALL orders for gross totals (including returned/cancelled for reference)
    totalGross += orderTotal;
    totalSubtotal += orderSubtotal;

    if (revenueMap.has(dateStr)) {
      const current = revenueMap.get(dateStr)!;
      revenueMap.set(dateStr, {
        total: current.total + orderTotal,
        subtotal: current.subtotal + orderSubtotal
      });
    }
  });

  const revenueData = Array.from(revenueMap.entries()).map(([date, data]) => ({ 
    date, 
    displayDate: format(parseISO(date), "MMM d"),
    revenue: data.total,
    subtotal: data.subtotal
  }));

  // B. Top Selling Products
  const productMap = new Map<string, { id: string, title: string, variant: string, qty: number, revenue: number }>();
  orders.forEach((o: any) => {
    const items = o.line_items as any[];
    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        const key = `${item.product_id || item.title}-${item.variant_id || item.variant_title}`;
        if (!productMap.has(key)) {
          productMap.set(key, { 
            id: key, 
            title: item.title || item.name || 'Unknown', 
            variant: item.variant_title || '', 
            qty: 0, 
            revenue: 0 
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
  const dispatchedMap = new Map<string, { id: string, title: string, variant: string, qty: number }>();
  dispatches.forEach((d: any) => {
    const items = d.orders?.line_items;
    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        const key = `${item.product_id || item.title}-${item.variant_id || item.variant_title}`;
        if (!dispatchedMap.has(key)) {
          dispatchedMap.set(key, { 
            id: key, 
            title: item.title || item.name || 'Unknown', 
            variant: item.variant_title || '', 
            qty: 0
          });
        }
        dispatchedMap.get(key)!.qty += item.quantity || 1;
      });
    }
  });
  const topDispatched = Array.from(dispatchedMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  // D. Return-adjusted calculations using single Unified Reporting Engine
  const unifiedMetrics = await getUnifiedReportMetrics({
    dateFilter: params.filterType,
    startDate: startDateStr,
    endDate: endDateStr,
  });

  const returnedOrders = orders.filter((o: any) => o.internal_status === 'returned');
  const cancelledOrders = orders.filter((o: any) => o.internal_status === 'cancelled');
  const deliveredOrders = orders.filter((o: any) => o.internal_status === 'delivered');

  const cancelledRevenue = cancelledOrders.reduce((acc: number, o: any) => acc + (Number(o.total_price) || 0), 0);
  const deliveredRevenue = unifiedMetrics.deliveredRevenue;
  const totalReturnedRevenue = unifiedMetrics.returnedValue;
  const totalReturnDeliveryFees = unifiedMetrics.returnFees;
  const partialReturnDeductions = Math.max(0, unifiedMetrics.returnedValue - returnedOrders.reduce((acc: number, o: any) => acc + (Number(o.total_price) || 0), 0));
  const netCollectibleRevenue = unifiedMetrics.netRevenue;

  // Success rate = Delivered / (Delivered + Returned) * 100
  const totalFinalizedOrders = unifiedMetrics.deliveredCount + unifiedMetrics.returnedCount;
  const successRate = totalFinalizedOrders > 0
    ? Math.round((unifiedMetrics.deliveredCount / totalFinalizedOrders) * 100)
    : 100;

  // General Order Stats
  const orderStats = {
    totalOrders: unifiedMetrics.totalOrders || orders.length,
    dispatchedOrders: unifiedMetrics.dispatchedCount,
    deliveredOrders: unifiedMetrics.deliveredCount,
    cancelledOrders: cancelledOrders.length,
    returnedOrders: unifiedMetrics.returnedCount,
  };

  const totalDispatchedAmount = unifiedMetrics.amountToCollect;

  return (
    <ReportsClient 
      revenueData={revenueData}
      topProducts={topProducts}
      topDispatched={topDispatched}
      orderStats={orderStats}
      totalGross={totalGross}
      totalSubtotal={totalSubtotal}
      totalDispatchedAmount={totalDispatchedAmount}
      returnedRevenue={totalReturnedRevenue}
      cancelledRevenue={cancelledRevenue}
      deliveredRevenue={deliveredRevenue}
      netCollectibleRevenue={netCollectibleRevenue}
      totalReturnDeliveryFees={totalReturnDeliveryFees}
      partialReturnDeductions={partialReturnDeductions}
      successRate={successRate}
      initialStartDate={startDateStr}
      initialEndDate={endDateStr}
      initialFilterType={params.filterType || "last_30_days"}
    />
  );
}
