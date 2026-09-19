import { createServiceClient } from "@/lib/supabase/server";
import {
  Package, Truck, CheckCircle, Clock, XCircle, TrendingUp, Banknote,
  ArrowRight, RotateCcw, ShoppingBag, ChevronRight
} from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOrderDisplayStatus } from "@/lib/order-status";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { PathaoReconciliationWidget } from "@/components/dashboard/pathao-reconciliation-widget";
import type { Order } from "@/types/database";
import type { LucideIcon } from "lucide-react";
import { getCachedDashboardData } from "@/lib/dashboard-service";

type KPI = {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
  border: string;
  glow: string;
  format: "number" | "currency";
  href?: string;
};

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dateFilter?: string }>;
}) {
  const supabase = createServiceClient();
  const params = await searchParams;
  const dateFilter = params.dateFilter || "this_month";

  const data = await getCachedDashboardData(dateFilter);
  const {
    unifiedMetrics,
    revenueData,
    topProducts,
    liveStats,
    pendingCOD,
    deliveredCOD,
    returnedCOD,
  } = data;

  const { data: recentOrders } = await supabase
    .from("orders")
    .select("*")
    .order("shopify_created_at", { ascending: false })
    .limit(8);

  // ── KPI Data ──────────────────────────────────────────────────────────────
  const kpis: KPI[] = [
    {
      label: "Total Orders",
      value: unifiedMetrics.totalOrders,
      icon: ShoppingBag,
      color: "text-sky-400",
      border: "border-sky-500/20",
      glow: "bg-sky-500/5",
      href: "/orders",
      format: "number",
    },
    {
      label: "Delivered Sales",
      value: unifiedMetrics.courierDeliveredValue || unifiedMetrics.deliveredRevenue,
      icon: TrendingUp,
      color: "text-emerald-400",
      border: "border-emerald-500/20",
      glow: "bg-emerald-500/5",
      format: "currency",
    },
    {
      label: "In Transit",
      value: unifiedMetrics.courierActiveTotalCount || unifiedMetrics.dispatchedCount,
      icon: Truck,
      color: "text-indigo-400",
      border: "border-indigo-500/20",
      glow: "bg-indigo-500/5",
      href: "/dispatches",
      format: "number",
    },
    {
      label: "Pending Orders",
      value: unifiedMetrics.pendingOrdersCount,
      icon: Clock,
      color: "text-amber-400",
      border: "border-amber-500/20",
      glow: "bg-amber-500/5",
      href: "/orders?status=pending",
      format: "number",
    },
    {
      label: "Cancelled",
      value: unifiedMetrics.cancelledOrdersCount,
      icon: XCircle,
      color: "text-rose-400",
      border: "border-rose-500/20",
      glow: "bg-rose-500/5",
      format: "number",
    },
    {
      label: "COD Pending",
      value: unifiedMetrics.courierProcessingValue || pendingCOD,
      icon: Banknote,
      color: "text-violet-400",
      border: "border-violet-500/20",
      glow: "bg-violet-500/5",
      format: "currency",
    },
  ] satisfies KPI[];

  // ── COD Financials ─────────────────────────────────────────────────────────
  const financials = [
    {
      label: "Pending COD",
      subtitle: "In transit / awaiting",
      value: unifiedMetrics.courierProcessingValue || pendingCOD,
      icon: Truck,
      color: "text-amber-400",
      border: "border-amber-500/20",
      bg: "bg-amber-500/5",
    },
    {
      label: "Collected Revenue",
      subtitle: "Delivered successfully",
      value: unifiedMetrics.courierDeliveredValue || deliveredCOD,
      icon: CheckCircle,
      color: "text-emerald-400",
      border: "border-emerald-500/20",
      bg: "bg-emerald-500/5",
    },
    {
      label: "Lost to Returns",
      subtitle: "Returned order value",
      value:
        unifiedMetrics.courierReturnedValue +
          unifiedMetrics.courierPaidReturnValue || returnedCOD,
      icon: RotateCcw,
      color: "text-rose-400",
      border: "border-rose-500/20",
      bg: "bg-rose-500/5",
    },
  ];

  // ── Pipeline ───────────────────────────────────────────────────────────────
  const pipelineMax = Math.max(
    unifiedMetrics.pendingOrdersCount,
    liveStats.preparing_orders,
    unifiedMetrics.courierActiveTotalCount || unifiedMetrics.dispatchedCount,
    unifiedMetrics.courierDeliveredCount || unifiedMetrics.deliveredCount,
    1
  );

  const pipeline = [
    {
      label: "Pending",
      value: unifiedMetrics.pendingOrdersCount,
      color: "bg-amber-500",
      text: "text-amber-400",
      href: "/orders?status=pending",
      icon: Clock,
    },
    {
      label: "Preparing",
      value: liveStats.preparing_orders || 0,
      color: "bg-sky-500",
      text: "text-sky-400",
      href: "/orders?status=preparing",
      icon: Package,
    },
    {
      label: "Dispatched",
      value:
        unifiedMetrics.courierActiveTotalCount || unifiedMetrics.dispatchedCount,
      color: "bg-indigo-500",
      text: "text-indigo-400",
      href: "/dispatches",
      icon: Truck,
    },
    {
      label: "Delivered",
      value:
        unifiedMetrics.courierDeliveredCount || unifiedMetrics.deliveredCount,
      color: "bg-emerald-500",
      text: "text-emerald-400",
      href: "/orders?status=delivered",
      icon: CheckCircle,
    },
  ];

  const fmt = (v: number | string, type: string) => {
    if (type === "currency") return `৳${Number(v).toLocaleString()}`;
    return Number(v).toLocaleString();
  };

  const maxQty = Math.max(...topProducts.map((p: { qty: number }) => p.qty), 1);

  return (
    <div className="space-y-5 pb-10">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <DashboardHeader />

      {/* ── Row 1: KPI Strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((kpi) => {
          const inner = (
            <div
              className={`relative overflow-hidden rounded-2xl p-4 h-full border ${kpi.border} ${kpi.glow} group transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30`}
            >
              <div className="flex items-start justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 leading-none">
                  {kpi.label}
                </p>
                <kpi.icon className={`w-4 h-4 ${kpi.color} opacity-70 shrink-0`} />
              </div>
              <p className={`text-2xl font-bold mt-3 ${kpi.color} tracking-tight leading-none`}>
                {fmt(kpi.value, kpi.format)}
              </p>
              {kpi.href && (
                <ArrowRight
                  className={`w-3.5 h-3.5 ${kpi.color} opacity-0 group-hover:opacity-60 absolute bottom-3.5 right-3.5 transition-opacity`}
                />
              )}
            </div>
          );
          return kpi.href ? (
            <Link key={kpi.label} href={kpi.href} className="block">
              {inner}
            </Link>
          ) : (
            <div key={kpi.label}>{inner}</div>
          );
        })}
      </div>

      {/* ── Row 2: Revenue Chart + Pathao Widget ────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Revenue Chart */}
        <div className="xl:col-span-8 rounded-2xl border border-zinc-800/60 bg-zinc-900/80 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Revenue Overview</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Order value over selected period</p>
            </div>
            <div className="flex items-center gap-4 text-[11px]">
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                w/ Delivery
              </span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                w/o Delivery
              </span>
            </div>
          </div>
          <div className="h-60">
            <RevenueChart data={revenueData} />
          </div>
        </div>

        {/* Pathao Widget */}
        <div className="xl:col-span-4">
          <PathaoReconciliationWidget metrics={unifiedMetrics} />
        </div>
      </div>

      {/* ── Row 3: COD Financials ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {financials.map((f) => (
          <div
            key={f.label}
            className={`rounded-2xl p-5 border ${f.border} ${f.bg} flex items-center gap-4`}
          >
            <div className={`w-10 h-10 rounded-xl ${f.bg} border ${f.border} flex items-center justify-center shrink-0`}>
              <f.icon className={`w-5 h-5 ${f.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">{f.label}</p>
              <p className={`text-xl font-bold ${f.color} mt-0.5 truncate`}>
                ৳{Number(f.value).toLocaleString()}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">{f.subtitle}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Row 4: Top Products + Order Pipeline ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Top Selling Products */}
        <div className="lg:col-span-5 rounded-2xl border border-zinc-800/60 bg-zinc-900/80 p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-zinc-100">Top Selling Products</h2>
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">By quantity sold</span>
          </div>
          {topProducts.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 text-sm">No product data this period.</div>
          ) : (
            <div className="space-y-4">
              {topProducts.map((p: { id: string; title: string; qty: number; revenue: number }, i: number) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-zinc-600 w-4 shrink-0">#{i + 1}</span>
                      <p className="text-sm font-medium text-zinc-200 truncate">{p.title}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 pl-3">
                      <span className="text-xs text-zinc-400 font-medium">{p.qty} sold</span>
                      <span className="text-sm font-bold text-emerald-400">৳{p.revenue.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-1000"
                      style={{ width: `${(p.qty / maxQty) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order Pipeline */}
        <div className="lg:col-span-7 rounded-2xl border border-zinc-800/60 bg-zinc-900/80 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Order Pipeline</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Live fulfillment status breakdown</p>
            </div>
          </div>
          <div className="space-y-5">
            {pipeline.map((stage, i) => (
              <Link key={stage.label} href={stage.href} className="block group">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-lg ${stage.color.replace("bg-", "bg-").replace("500", "500/15")} border ${stage.text.replace("text-", "border-").replace("400", "500/30")} flex items-center justify-center shrink-0`}>
                    <stage.icon className={`w-4 h-4 ${stage.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold ${stage.text} uppercase tracking-wider`}>
                        {stage.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-100">{stage.value}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                      </div>
                    </div>
                    <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${stage.color} rounded-full transition-all duration-1000 ease-out`}
                        style={{ width: `${Math.max((stage.value / pipelineMax) * 100, stage.value > 0 ? 3 : 0)}%` }}
                      />
                    </div>
                  </div>
                </div>
                {i < pipeline.length - 1 && (
                  <div className="ml-4 mt-2 mb-0 w-0.5 h-2 bg-zinc-800 ml-[15px]" />
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 5: Recent Orders ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/80 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/60">
          <div>
            <h2 className="text-sm font-semibold text-zinc-100">Recent Orders</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">Latest 8 orders from your store</p>
          </div>
          <Link
            href="/orders"
            className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
          >
            View all
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recentOrders?.length === 0 ? (
          <div className="text-center py-16 text-zinc-500 text-sm">
            No orders yet. Sync your Shopify store first.
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/40">
            {recentOrders?.map((order: Order) => {
              const statusColor =
                order.internal_status === "dispatched"
                  ? "bg-indigo-500"
                  : order.internal_status === "delivered"
                  ? "bg-emerald-500"
                  : order.internal_status === "cancelled"
                  ? "bg-rose-500"
                  : order.internal_status === "returned"
                  ? "bg-orange-500"
                  : order.internal_status === "preparing"
                  ? "bg-sky-500"
                  : "bg-zinc-600";
              return (
                <Link key={order.id} href={`/orders/${order.id}`}>
                  <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-zinc-800/40 transition-colors group">
                    <div className={`w-1 h-7 rounded-full ${statusColor} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-zinc-100 group-hover:text-white transition-colors">
                          {order.shopify_order_name}
                        </span>
                        <StatusBadge status={getOrderDisplayStatus(order)} />
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">
                        <span className="text-zinc-400">{order.customer_name}</span>
                        {order.customer_phone && (
                          <span className="text-zinc-600"> · {order.customer_phone}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-zinc-100">
                        ৳{Number(order.total_price).toLocaleString()}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {new Date(
                          order.shopify_created_at || order.created_at
                        ).toLocaleDateString("en-BD", {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
