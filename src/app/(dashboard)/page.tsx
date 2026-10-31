import { createServiceClient } from "@/lib/supabase/server";
import {
  Package,
  Truck,
  CheckCircle,
  Clock,
  TrendingUp,
  Banknote,
  ArrowRight,
  RotateCcw,
  ShoppingBag,
  ChevronRight,
  Wallet,
  Receipt,
  Percent,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
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
  subtitle?: string;
  changePct?: number;
  invertChangeColor?: boolean;
  icon: LucideIcon;
  color: string;
  border: string;
  glow: string;
  format: "number" | "currency" | "percent";
  href?: string;
};

export const metadata = { title: "Dashboard — Universes RAW" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ dateFilter?: string; from?: string; to?: string }>;
}) {
  const supabase = createServiceClient();
  const params = await searchParams;
  const dateFilter = params.dateFilter || "this_month";

  const data = await getCachedDashboardData(dateFilter, params.from, params.to);
  const {
    unifiedMetrics,
    comprehensiveReport,
    comparison,
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
    .eq("is_archived", false)
    .order("shopify_created_at", { ascending: false })
    .limit(8);

  const op = comprehensiveReport?.orderPerformance;
  const sp = comprehensiveReport?.salesPerformance;
  const rp = comprehensiveReport?.returnPerformance;
  const dp = comprehensiveReport?.deliveryPerformance;
  const cp = comprehensiveReport?.courierPerformance;
  const fp = comprehensiveReport?.financialPerformance;

  // ── 10 Executive KPI Cards with Period-over-Period Growth ─────────────────
  const kpis: KPI[] = [
    {
      label: "Total Orders",
      value: op?.totalOrdersReceived ?? unifiedMetrics.totalOrders,
      subtitle: `${op?.cancelledOrdersCount ?? unifiedMetrics.cancelledOrdersCount} cancelled`,
      changePct: comparison?.totalOrdersReceived?.percentChange,
      icon: ShoppingBag,
      color: "text-sky-400",
      border: "border-sky-500/20",
      glow: "bg-sky-500/5",
      href: "/orders?status=everything",
      format: "number",
    },
    {
      label: "Gross Order Value",
      value: sp?.grossOrderValue ?? unifiedMetrics.grossOrderValue ?? 0,
      subtitle: `AOV: ৳${(sp?.averageOrderValue ?? 0).toLocaleString()}`,
      changePct: comparison?.grossOrderValue?.percentChange,
      icon: TrendingUp,
      color: "text-indigo-400",
      border: "border-indigo-500/20",
      glow: "bg-indigo-500/5",
      href: "/orders?status=everything",
      format: "currency",
    },
    {
      label: "Delivered Sales",
      value:
        sp?.deliveredGrossSalesValue ||
        unifiedMetrics.courierDeliveredValue ||
        unifiedMetrics.deliveredRevenue,
      subtitle: `${op?.deliveredOrdersCount ?? unifiedMetrics.deliveredCount} delivered orders`,
      changePct: comparison?.deliveredSalesValue?.percentChange,
      icon: CheckCircle,
      color: "text-emerald-400",
      border: "border-emerald-500/20",
      glow: "bg-emerald-500/5",
      href: "/deliveries",
      format: "currency",
    },
    {
      label: "Net Sales (After Returns)",
      value: sp?.netSalesAfterReturns ?? unifiedMetrics.netRevenue,
      subtitle: `After -৳${(sp?.partialReturnedValueOnDelivered ?? 0).toLocaleString()} partial ded.`,
      changePct: comparison?.netSalesAfterReturns?.percentChange,
      icon: Wallet,
      color: "text-teal-400",
      border: "border-teal-500/20",
      glow: "bg-teal-500/5",
      href: "/reports",
      format: "currency",
    },
    {
      label: "Total Returned Value",
      value: rp?.totalReturnedProductValue ?? unifiedMetrics.returnedValue,
      subtitle: `${rp?.fullReturnsCount ?? 0} full · ${rp?.partialReturnsCount ?? 0} partial`,
      changePct: comparison?.totalReturnedProductValue?.percentChange,
      invertChangeColor: true,
      icon: RotateCcw,
      color: "text-rose-400",
      border: "border-rose-500/20",
      glow: "bg-rose-500/5",
      href: "/returns",
      format: "currency",
    },
    {
      label: "Finalized Return Rate",
      value: rp?.finalizedOrderReturnRate ?? unifiedMetrics.finalizedOrderReturnRate ?? 0,
      subtitle: `Dispatched rate: ${rp?.orderReturnRate ?? 0}%`,
      changePct: comparison?.finalizedOrderReturnRate?.percentChange,
      invertChangeColor: true,
      icon: Percent,
      color: "text-orange-400",
      border: "border-orange-500/20",
      glow: "bg-orange-500/5",
      href: "/returns",
      format: "percent",
    },
    {
      label: "Delivery Success Rate",
      value: dp?.deliverySuccessRate ?? 0,
      subtitle: `Avg time: ${dp?.averageDeliveryTimeDays ?? 0}d`,
      changePct: comparison?.deliverySuccessRate?.percentChange,
      icon: Truck,
      color: "text-cyan-400",
      border: "border-cyan-500/20",
      glow: "bg-cyan-500/5",
      href: "/deliveries",
      format: "percent",
    },
    {
      label: "COD Pending / In Transit",
      value: cp?.pendingCodInTransit || unifiedMetrics.courierProcessingValue || pendingCOD,
      subtitle: `${op?.inTransitOrdersCount ?? unifiedMetrics.courierProcessingCount ?? 0} parcels in transit`,
      icon: Banknote,
      color: "text-violet-400",
      border: "border-violet-500/20",
      glow: "bg-violet-500/5",
      href: "/dispatches",
      format: "currency",
    },
  ];

  // ── COD & Sales Summary ────────────────────────────────────────────────────
  const financials = [
    {
      label: "Pending COD",
      subtitle: "In transit / awaiting delivery",
      value: cp?.pendingCodInTransit || unifiedMetrics.courierProcessingValue || pendingCOD,
      icon: Truck,
      color: "text-amber-400",
      border: "border-amber-500/20",
      bg: "bg-amber-500/5",
      href: "/dispatches",
    },
    {
      label: "Collected Revenue",
      subtitle: "Delivered sales value",
      value:
        sp?.deliveredGrossSalesValue ||
        unifiedMetrics.courierDeliveredValue ||
        deliveredCOD,
      icon: CheckCircle,
      color: "text-emerald-400",
      border: "border-emerald-500/20",
      bg: "bg-emerald-500/5",
      href: "/deliveries",
    },
    {
      label: "Returned Product Value",
      subtitle: `${rp?.fullReturnsCount ?? 0} full & ${rp?.partialReturnsCount ?? 0} partial returns`,
      value: rp?.totalReturnedProductValue ?? unifiedMetrics.returnedValue ?? returnedCOD,
      icon: RotateCcw,
      color: "text-rose-400",
      border: "border-rose-500/20",
      bg: "bg-rose-500/5",
      href: "/returns",
    },
  ];

  // ── Operational Alerts & Action Queue ──────────────────────────────────────
  const operationalAlerts = [
    {
      label: "Pending Dispatch",
      count: (op?.pendingOrdersCount ?? 0) + (op?.preparingOrdersCount ?? 0),
      desc: "Orders awaiting verification or Pathao booking",
      href: "/orders?status=all",
      tone: "text-amber-400 border-amber-500/25 bg-amber-500/5",
    },
    {
      label: "Unverified Returns",
      count: rp?.unverifiedReturnsCount ?? unifiedMetrics.needsAttentionCount ?? 0,
      desc: "Partial / webhook returns needing admin review",
      href: "/returns?status=pending_verification",
      tone: "text-rose-400 border-rose-500/25 bg-rose-500/5",
    },
    {
      label: "Hold / Failed Deliveries",
      count: (op?.holdOrdersCount ?? 0) + (cp?.holdOrFailedParcelsCount ?? 0),
      desc: "Orders on hold or delivery issue reported",
      href: "/orders?status=hold",
      tone: "text-sky-400 border-sky-500/25 bg-sky-500/5",
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
      href: "/orders?status=all",
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
      value: unifiedMetrics.courierActiveTotalCount || unifiedMetrics.dispatchedCount,
      color: "bg-indigo-500",
      text: "text-indigo-400",
      href: "/dispatches",
      icon: Truck,
    },
    {
      label: "Delivered",
      value: unifiedMetrics.courierDeliveredCount || unifiedMetrics.deliveredCount,
      color: "bg-emerald-500",
      text: "text-emerald-400",
      href: "/deliveries",
      icon: CheckCircle,
    },
  ];

  const fmt = (v: number | string, type: string) => {
    if (type === "currency") return `৳${Math.round(Number(v)).toLocaleString()}`;
    if (type === "percent") return `${Number(v).toFixed(1)}%`;
    return Number(v).toLocaleString();
  };

  const maxQty = Math.max(...topProducts.map((p: { qty: number }) => p.qty), 1);

  return (
    <div className="space-y-5 pb-10">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <DashboardHeader />

      {/* ── Row 1: 10 Executive KPI Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((kpi) => {
          const hasChange = typeof kpi.changePct === "number" && !isNaN(kpi.changePct);
          const isPositive = (kpi.changePct || 0) >= 0;
          const isGood = kpi.invertChangeColor ? !isPositive : isPositive;

          const inner = (
            <div
              className={`relative overflow-hidden rounded-2xl p-4 h-full border ${kpi.border} ${kpi.glow} group transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/30`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 leading-tight">
                  {kpi.label}
                </p>
                <kpi.icon className={`w-4 h-4 ${kpi.color} opacity-75 shrink-0`} />
              </div>
              <p className={`text-2xl font-bold mt-2.5 ${kpi.color} tracking-tight leading-none`}>
                {fmt(kpi.value, kpi.format)}
              </p>
              <div className="flex items-center justify-between gap-2 mt-2.5">
                {kpi.subtitle ? (
                  <span className="text-[11px] text-zinc-500 truncate">{kpi.subtitle}</span>
                ) : (
                  <span />
                )}
                {hasChange && (
                  <span
                    className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${
                      isGood
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}
                    title="Compared with previous period"
                  >
                    {isPositive ? (
                      <ArrowUpRight className="w-2.5 h-2.5" />
                    ) : (
                      <ArrowDownRight className="w-2.5 h-2.5" />
                    )}
                    {Math.abs(kpi.changePct || 0)}%
                  </span>
                )}
              </div>
              {kpi.href && (
                <ArrowRight
                  className={`w-3.5 h-3.5 ${kpi.color} opacity-0 group-hover:opacity-60 absolute top-3.5 right-9 transition-opacity`}
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

      {/* ── Operational Action Strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {operationalAlerts.map((alert) => (
          <Link
            key={alert.label}
            href={alert.href}
            className={`rounded-xl border p-3.5 flex items-center justify-between transition-all hover:brightness-110 ${alert.tone}`}
          >
            <div className="min-w-0 pr-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wider">{alert.label}</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-1 truncate">{alert.desc}</p>
            </div>
            <span className="text-xl font-extrabold shrink-0">{alert.count}</span>
          </Link>
        ))}
      </div>

      {/* ── Row 2: Revenue Chart + Pathao Widget ────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 rounded-2xl border border-zinc-800/60 bg-zinc-900/80 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Daily Sales Trend (Asia/Dhaka)</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Original order value vs product subtotal over selected period
              </p>
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

        <div className="xl:col-span-4">
          <PathaoReconciliationWidget metrics={unifiedMetrics} />
        </div>
      </div>

      {/* ── Row 3: Financial Reconciliation Strip ────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {financials.map((f) => (
          <Link
            key={f.label}
            href={f.href}
            className={`rounded-2xl p-5 border ${f.border} ${f.bg} flex items-center gap-4 transition-all hover:brightness-110`}
          >
            <div
              className={`w-10 h-10 rounded-xl ${f.bg} border ${f.border} flex items-center justify-center shrink-0`}
            >
              <f.icon className={`w-5 h-5 ${f.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
                {f.label}
              </p>
              <p className={`text-xl font-bold ${f.color} mt-0.5 truncate`}>
                ৳{Math.round(Number(f.value)).toLocaleString()}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{f.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Row 4: Top Products + Order Pipeline ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 rounded-2xl border border-zinc-800/60 bg-zinc-900/80 p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-zinc-100">Top Selling Products</h2>
            <Link
              href="/reports"
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Full SKU Report →
            </Link>
          </div>
          {topProducts.length === 0 ? (
            <div className="py-10 text-center text-zinc-500 text-sm">
              No product data this period.
            </div>
          ) : (
            <div className="space-y-4">
              {topProducts.map(
                (p: { id: string; title: string; qty: number; revenue: number }, i: number) => (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-zinc-600 w-4 shrink-0">
                          #{i + 1}
                        </span>
                        <p className="text-sm font-medium text-zinc-200 truncate">{p.title}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 pl-3">
                        <span className="text-xs text-zinc-400 font-medium">{p.qty} units</span>
                        <span className="text-sm font-bold text-emerald-400">
                          ৳{Math.round(p.revenue).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-1000"
                        style={{ width: `${(p.qty / maxQty) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Order Pipeline */}
        <div className="lg:col-span-7 rounded-2xl border border-zinc-800/60 bg-zinc-900/80 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Order Fulfillment Pipeline</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Live stage distribution</p>
            </div>
          </div>
          <div className="space-y-5">
            {pipeline.map((stage, i) => (
              <Link key={stage.label} href={stage.href} className="block group">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-8 h-8 rounded-lg ${stage.color.replace("500", "500/15")} border ${stage.text.replace("text-", "border-").replace("400", "500/30")} flex items-center justify-center shrink-0`}
                  >
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
                        style={{
                          width: `${Math.max(
                            (stage.value / pipelineMax) * 100,
                            stage.value > 0 ? 3 : 0
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                {i < pipeline.length - 1 && (
                  <div className="mt-2 mb-0 w-0.5 h-2 bg-zinc-800 ml-[15px]" />
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
            <p className="text-[11px] text-zinc-500 mt-0.5">Latest 8 orders from Universes RAW</p>
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
              const origPrice = Number(
                (order as any).original_total_price ?? order.total_price ?? 0
              );
              return (
                <Link
                  key={order.id}
                  href={`/orders?status=everything&search=${encodeURIComponent(order.shopify_order_name)}`}
                >
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
                        ৳{origPrice.toLocaleString()}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {new Date(
                          order.shopify_created_at || order.created_at
                        ).toLocaleDateString("en-BD", {
                          timeZone: "Asia/Dhaka",
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
