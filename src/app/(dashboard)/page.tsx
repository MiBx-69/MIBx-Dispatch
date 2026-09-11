import { createServiceClient } from "@/lib/supabase/server";
import { Package, Truck, CheckCircle, Clock, AlertCircle, TrendingUp, Zap, XCircle } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOrderDisplayStatus } from "@/lib/order-status";
import { subDays, format, parseISO, differenceInDays } from "date-fns";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { TopProducts } from "@/components/dashboard/top-products";
import { FulfillmentStats } from "@/components/dashboard/fulfillment-stats";
import { FinancialsWidget } from "@/components/dashboard/financials-widget";
import { CourierPerformanceChart } from "@/components/dashboard/courier-performance-chart";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { FraudWidget } from "@/components/dashboard/fraud-widget";
import { DispatchedProductsToday } from "@/components/dashboard/dispatched-today";
import type { Order } from "@/types/database";
import { getUnifiedReportMetrics, resolveDateRange } from "@/lib/reporting-engine";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ dateFilter?: string }> }) {
  const supabase = createServiceClient();
  const params = await searchParams;
  const dateFilter = params.dateFilter || "last_30_days";

  const unifiedMetrics = await getUnifiedReportMetrics({
    dateFilter,
  });

  const { startDateStr: resolvedStart, endDateStr: resolvedEnd } = resolveDateRange(dateFilter);
  let startDateStr = resolvedStart || subDays(new Date(), 30).toISOString();
  let endDateStr = resolvedEnd || new Date().toISOString();

  const MIN_DATE = new Date("2026-08-31T18:00:00.000Z");
  // Clamp startDateStr to MIN_DATE
  if (new Date(startDateStr) < MIN_DATE) {
    startDateStr = MIN_DATE.toISOString();
  }

  // Fetch 10 most recent orders
  const { data: recentOrders } = await supabase
    .from("orders")
    .select("*")
    .order("shopify_created_at", { ascending: false })
    .limit(10);

  // Fetch orders matching the date filter
  const { data: recentMonthOrders } = await supabase
    .from("orders")
    .select("total_price, subtotal_price, shopify_created_at, created_at, line_items, financial_status, fulfillment_status, internal_status, fraud_status")
    .gte("shopify_created_at", startDateStr)
    .lte("shopify_created_at", endDateStr)
    .order("shopify_created_at", { ascending: false });

  // --- Data Processing for Dashboards ---
  const orders = recentMonthOrders || [];
  
  // 1. Revenue Chart
  const revenueMap = new Map<string, { total: number, subtotal: number }>();
  
  // Ensure we show at least a few days on the chart even if it's "Today"
  let daysDiff = differenceInDays(parseISO(endDateStr), parseISO(startDateStr));
  if (daysDiff < 7) {
     const tempStart = subDays(parseISO(endDateStr), 6);
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
    date, 
    displayDate: format(parseISO(date), "MMM d"),
    revenue: data.total,
    subtotal: data.subtotal
  }));

  // 2. Top Products
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
    .slice(0, 5);

  // 2b. Dispatched Products in Period
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
          const key = `${item.product_id || item.title}-${item.variant_id || item.variant_title}`;
          if (!dispatchedPeriodMap.has(key)) {
            dispatchedPeriodMap.set(key, { 
              id: key, 
              title: item.title || item.name || 'Unknown', 
              variant: item.variant_title || '', 
              qty: 0
            });
          }
          dispatchedPeriodMap.get(key)!.qty += item.quantity || 1;
        });
      }
    });
  }
  
  const topDispatchedPeriod = Array.from(dispatchedPeriodMap.values())
    .sort((a, b) => b.qty - a.qty);

  // 3. Fulfillment Stats
  const fStats = {
    unfulfilled: 0,
    partial: 0,
    fulfilled: 0,
    paid: 0,
    pending_payment: 0,
    total: orders.length
  };
  
  // 4. Fraud Stats
  const fraudStats = { safe: 0, risky: 0, fraud: 0 };

  // 5. Live Dashboard Quick Stats
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
    subtotal_period: 0
  };

  let pendingCOD = 0;
  let deliveredCOD = 0;
  let returnedCOD = 0;
  const statusCountMap = new Map<string, number>();

  orders.forEach((o: any) => {
    // Fulfillment
    if (o.fulfillment_status === 'fulfilled') fStats.fulfilled++;
    else if (o.fulfillment_status === 'partial') fStats.partial++;
    else fStats.unfulfilled++;
    
    if (o.financial_status === 'paid') fStats.paid++;
    else fStats.pending_payment++;

    // Fraud
    if (o.fraud_status === 'safe') fraudStats.safe++;
    else if (o.fraud_status === 'risky') fraudStats.risky++;
    else if (o.fraud_status === 'fraud') fraudStats.fraud++;

    // Status counts
    const effectiveStatus = getOrderDisplayStatus(o);
    if (effectiveStatus === 'pending') liveStats.pending_orders++;
    else if (effectiveStatus === 'preparing') liveStats.preparing_orders++;
    else if (effectiveStatus === 'dispatched') liveStats.dispatched_orders++;
    else if (effectiveStatus === 'delivered') liveStats.delivered_orders++;
    else if (effectiveStatus === 'hold') liveStats.hold_orders++;

    // Period counts (all orders in this array fall within the selected date period)
    liveStats.orders_period++;
    // Only count revenue from non-cancelled and non-returned orders
    if (o.internal_status !== 'cancelled' && o.internal_status !== 'returned') {
      liveStats.revenue_period += Number(o.total_price) || 0;
      liveStats.subtotal_period += Number(o.subtotal_price) || 0;
    }
    if (o.internal_status === 'cancelled') {
      liveStats.cancelled_period++;
    }
    if (o.internal_status === 'returned') {
      liveStats.returned_period++;
      liveStats.returned_revenue += Number(o.total_price) || 0;
    }

    // Courier Stats
    const st = o.internal_status;
    if (st === "dispatched") {
       statusCountMap.set("In Transit", (statusCountMap.get("In Transit") || 0) + 1);
       pendingCOD += Number(o.total_price);
    } else if (st === "delivered") {
       statusCountMap.set("Delivered", (statusCountMap.get("Delivered") || 0) + 1);
       deliveredCOD += Number(o.total_price);
    } else if (st === "returned") {
       statusCountMap.set("Returned", (statusCountMap.get("Returned") || 0) + 1);
       returnedCOD += Number(o.total_price);
    } else if (st !== "cancelled" && st !== "archived") {
       statusCountMap.set("Pending", (statusCountMap.get("Pending") || 0) + 1);
    }
  });

  liveStats.dispatched_period = unifiedMetrics.dispatchedCount;

  // Fetch partial return deductions in this period
  const { data: partialReturnsData } = await supabase
    .from("returns")
    .select("refund_amount, order_total, returned_items")
    .eq("return_type", "partial")
    .gte("returned_at", startDateStr)
    .lte("returned_at", endDateStr);

  const partialDeductions = (partialReturnsData || []).reduce(
    (acc: number, r: any) => {
      const val = Number(r.refund_amount) || 
        (Array.isArray(r.returned_items) && r.returned_items.reduce((s: number, i: any) => s + (Number(i.price || 0) * Number(i.quantity || 1)), 0)) ||
        (Number(r.order_total) || 0);
      return acc + val;
    }, 0
  );
  liveStats.returned_revenue += partialDeductions;
  returnedCOD += partialDeductions;

  const courierStats = Array.from(statusCountMap.entries()).map(([status, count]) => ({ status, count }));

  const statCards = [
    { label: "Pending Orders", value: unifiedMetrics.pendingOrdersCount, icon: Clock, color: "text-zinc-400", bg: "bg-zinc-800/50", href: "/orders?status=pending" },
    { label: "Preparing", value: liveStats.preparing_orders || 0, icon: Package, color: "text-amber-400", bg: "bg-amber-500/10", href: "/orders?status=preparing" },
    { label: "Dispatched", value: unifiedMetrics.dispatchedCount, icon: Truck, color: "text-indigo-400", bg: "bg-indigo-500/10", href: "/dispatches" },
    { label: "Delivered", value: unifiedMetrics.deliveredCount, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", href: "/orders?status=delivered" },
    { label: "On Hold", value: liveStats.hold_orders || 0, icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-500/10", href: "/orders?status=hold" },
    { label: "Net Revenue", value: `৳${Number(unifiedMetrics.netRevenue || unifiedMetrics.deliveredRevenue).toLocaleString()}`, subValue: `৳${Number(unifiedMetrics.deliveredRevenue).toLocaleString()} delivered`, icon: TrendingUp, color: "text-violet-400", bg: "bg-violet-500/10", isText: true },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <DashboardHeader />

      {/* Period Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        {/* Orders */}
        <div className="rounded-2xl p-4 lg:p-5 bg-zinc-900 border border-zinc-800/50 shadow-sm relative overflow-hidden group flex flex-col justify-center">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Package className="w-16 h-16 text-zinc-100" />
          </div>
          <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider relative z-10">Orders</p>
          <p className="text-2xl lg:text-4xl font-bold text-white mt-2 relative z-10 truncate">{unifiedMetrics.totalOrders}</p>
        </div>

        {/* Sales */}
        <div className="rounded-2xl p-4 lg:p-5 bg-emerald-500/5 border border-emerald-500/20 shadow-sm relative overflow-hidden group flex flex-col justify-center">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp className="w-16 h-16 text-emerald-400" />
          </div>
          <p className="text-xs text-emerald-400/80 font-medium uppercase tracking-wider relative z-10">Delivered Sales</p>
          <p className="text-2xl lg:text-4xl font-bold text-emerald-400 mt-2 relative z-10 truncate" title={`৳${Number(unifiedMetrics.deliveredRevenue).toLocaleString()}`}>
            ৳{Number(unifiedMetrics.deliveredRevenue).toLocaleString()}
          </p>
        </div>

        {/* Dispatched */}
        <div className="rounded-2xl p-4 lg:p-5 bg-indigo-500/5 border border-indigo-500/20 shadow-sm relative overflow-hidden group flex flex-col justify-center">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Truck className="w-16 h-16 text-indigo-400" />
          </div>
          <p className="text-xs text-indigo-400/80 font-medium uppercase tracking-wider relative z-10">Dispatched</p>
          <div className="flex items-center gap-2 relative z-10 mt-2 truncate">
            <p className="text-2xl lg:text-4xl font-bold text-indigo-400 truncate">{unifiedMetrics.dispatchedCount}</p>
            <Link href="/dispatches" className="text-[10px] text-indigo-500/60 hover:text-indigo-400 transition-colors uppercase tracking-widest font-semibold border border-indigo-500/20 px-2 py-0.5 rounded-full shrink-0">
              View
            </Link>
          </div>
        </div>

        {/* Cancelled */}
        <div className="rounded-2xl p-4 lg:p-5 bg-rose-500/5 border border-rose-500/20 shadow-sm relative overflow-hidden group flex flex-col justify-center">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <XCircle className="w-16 h-16 text-rose-400" />
          </div>
          <p className="text-xs text-rose-400/80 font-medium uppercase tracking-wider relative z-10">Cancelled</p>
          <p className="text-2xl lg:text-4xl font-bold text-rose-400 mt-2 relative z-10 truncate">{unifiedMetrics.cancelledOrdersCount}</p>
        </div>
      </div>

      {/* Advanced Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 rounded-2xl p-5 border border-zinc-800/50 bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">Revenue</h2>
          <RevenueChart data={revenueData} />
        </div>

        {/* Fulfillment Stats */}
        <div className="rounded-2xl p-5 border border-zinc-800/50 bg-zinc-900 flex flex-col justify-center">
          <FulfillmentStats stats={fStats} />
        </div>
      </div>

      {/* Courier, Financial, Fraud Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl p-5 border border-zinc-800/50 bg-zinc-900 flex flex-col justify-center">
          <FraudWidget stats={fraudStats} />
        </div>
        <div className="lg:col-span-2 rounded-2xl p-5 border border-zinc-800/50 bg-zinc-900 flex flex-col justify-center">
          <FinancialsWidget pendingCOD={pendingCOD} deliveredCOD={deliveredCOD} returnedCOD={returnedCOD} />
        </div>
        <div className="lg:col-span-3 h-80 rounded-2xl p-5 border border-zinc-800/50 bg-zinc-900">
          <CourierPerformanceChart data={courierStats} />
        </div>
      </div>

      {/* Top Products & Stat Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Products */}
        <div className="lg:col-span-1 rounded-2xl p-5 border border-zinc-800/50 bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">Top Selling Products</h2>
          <TopProducts products={topProducts} />
        </div>

        {/* Dispatched Products */}
        <div className="lg:col-span-1 rounded-2xl p-5 border border-zinc-800/50 bg-zinc-900">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">Dispatched Products</h2>
          <DispatchedProductsToday products={topDispatchedPeriod} />
        </div>

        {/* Quick Stats Grid */}
        <div className="lg:col-span-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
          {statCards.map((card) => (
            <div
              key={card.label}
              className={`rounded-xl p-4 ${card.bg} border border-zinc-800/50 flex-1 ${
                card.href ? "hover:border-zinc-700 transition-colors" : ""
              }`}
            >
              {card.href ? (
                <Link href={card.href} className="block">
                  <StatCardContent {...card} />
                </Link>
              ) : (
                <StatCardContent {...card} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-300">Recent Orders</h2>
          <Link href="/orders" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
            View all
          </Link>
        </div>
        <div className="space-y-2">
          {recentOrders?.length === 0 && (
            <div className="text-center py-10 text-zinc-600 text-sm rounded-xl border border-zinc-800">
              No orders yet. Sync your Shopify store first.
            </div>
          )}
          {recentOrders?.map((order: Order) => (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-zinc-900 border border-zinc-800
                             hover:border-zinc-700 hover:bg-zinc-800/50 transition-all">
                {/* Order name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-200">
                      {order.shopify_order_name}
                    </span>
                    <StatusBadge status={getOrderDisplayStatus(order)} />
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">
                    {order.customer_name}
                    {order.customer_phone ? ` · ${order.customer_phone}` : ""}
                  </p>
                </div>
                {/* Amount */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-zinc-200">
                    ৳{Number(order.total_price).toLocaleString()}
                  </p>
                  <p className="text-xs text-zinc-600">
                    {new Date(order.shopify_created_at || order.created_at).toLocaleDateString("en-BD", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-zinc-300 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/orders?status=pending"
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900 border border-zinc-800
                      hover:border-indigo-500/50 hover:bg-indigo-600/5 transition-all">
            <Package className="w-6 h-6 text-indigo-400" />
            <span className="text-xs font-medium text-zinc-300">Pending Orders</span>
          </Link>
          <form action="/api/sync/shopify" method="POST">
            <button type="submit"
              className="w-full flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-900 border border-zinc-800
                        hover:border-emerald-500/50 hover:bg-emerald-600/5 transition-all">
              <Zap className="w-6 h-6 text-emerald-400" />
              <span className="text-xs font-medium text-zinc-300">Sync Shopify</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatCardContent({ label, value, subValue, icon: Icon, color, isText }: any) {
  return (
    <>
      <Icon className={`w-5 h-5 ${color} mb-2`} />
      <p className={`text-xl font-bold ${isText ? color : "text-white"}`}>{value}</p>
      {subValue && <p className="text-xs font-semibold text-zinc-400 mt-1">{subValue}</p>}
      <p className="text-xs text-zinc-500 mt-0.5">{label}</p>
    </>
  );
}
