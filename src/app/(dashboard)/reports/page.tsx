import { createServiceClient } from "@/lib/supabase/server";
import { format, parseISO, differenceInDays, subDays } from "date-fns";
import { ReportsClient } from "./reports-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports" };

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
    .select("total_price, subtotal_price, shopify_created_at, created_at, line_items, financial_status, fulfillment_status, internal_status, fraud_status")
    .gte("shopify_created_at", startDateStr)
    .lte("shopify_created_at", endDateStr)
    .neq("internal_status", "cancelled")
    .order("shopify_created_at", { ascending: false });

  const orders = ordersData || [];

  // 2. Fetch Dispatches in date range
  const { data: dispatchesData } = await supabase
    .from("dispatches")
    .select("dispatched_at, is_cancelled, orders(line_items)")
    .gte("dispatched_at", startDateStr)
    .lte("dispatched_at", endDateStr)
    .eq("is_cancelled", false);
    
  const dispatches = dispatchesData || [];

  // --- Process Data for Charts ---

  // A. Revenue Data
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
    if (revenueMap.has(dateStr)) {
      const current = revenueMap.get(dateStr)!;
      const orderTotal = Number(o.total_price) || 0;
      const orderSubtotal = Number(o.subtotal_price) || 0;
      
      totalGross += orderTotal;
      totalSubtotal += orderSubtotal;
      
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

  // General Order Stats
  const orderStats = {
    totalOrders: orders.length,
    dispatchedOrders: dispatches.length,
    deliveredOrders: orders.filter((o: any) => o.internal_status === 'delivered').length,
    cancelledOrders: orders.filter((o: any) => o.internal_status === 'cancelled').length,
    returnedOrders: orders.filter((o: any) => o.internal_status === 'returned').length,
  };

  return (
    <ReportsClient 
      revenueData={revenueData}
      topProducts={topProducts}
      topDispatched={topDispatched}
      orderStats={orderStats}
      totalGross={totalGross}
      totalSubtotal={totalSubtotal}
      initialStartDate={startDateStr}
      initialEndDate={endDateStr}
      initialFilterType={params.filterType || "last_30_days"}
    />
  );
}
