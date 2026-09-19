"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp, Truck, CheckCircle2, RotateCcw, AlertTriangle,
  Banknote, Download, ArrowLeft, Search, ShieldAlert,
  MapPin, Clock, TrendingDown,
} from "lucide-react";
import { toast } from "sonner";

interface AnalyticsClientProps {
  dispatches: any[];
}

export function AnalyticsClient({ dispatches }: AnalyticsClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState<"all" | "dhaka" | "outside_dhaka" | "high_risk">("all");
  const [sortBy, setSortBy] = useState<"total" | "rate" | "return">("total");

  // ── Overall Metrics ──────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    let totalDispatches = 0;
    let deliveredCount = 0;
    let returnedCount = 0;
    let inTransitCount = 0;
    let totalExpectedCOD = 0;
    let deliveredCOD = 0;
    let totalCourierFees = 0;
    let totalDeliveryDays = 0;
    let deliveredWithTimeCount = 0;

    dispatches.forEach((d) => {
      totalDispatches++;
      const order = d.orders;
      const cod = Number(order?.total_price) || 0;
      const fee = Number(d.delivery_fee) || (d.recipient_city === 1 ? 60 : 120);
      totalExpectedCOD += cod;
      totalCourierFees += fee;

      const isDelivered =
        order?.internal_status === "delivered" ||
        Boolean(order?.delivered_at) ||
        (d.pathao_order_status || "").toLowerCase().includes("deliver");

      const isReturned =
        order?.internal_status === "returned" ||
        Boolean(order?.returned_at) ||
        (d.pathao_order_status || "").toLowerCase().includes("return");

      if (isDelivered) {
        deliveredCount++;
        deliveredCOD += cod;
        if (d.dispatched_at && order?.delivered_at) {
          const diffDays = Math.max(
            0.5,
            (new Date(order.delivered_at).getTime() - new Date(d.dispatched_at).getTime()) /
              (1000 * 60 * 60 * 24)
          );
          totalDeliveryDays += diffDays;
          deliveredWithTimeCount++;
        }
      } else if (isReturned) {
        returnedCount++;
      } else {
        inTransitCount++;
      }
    });

    return {
      totalDispatches,
      deliveredCount,
      returnedCount,
      inTransitCount,
      deliveredRate: totalDispatches > 0 ? (deliveredCount / totalDispatches) * 100 : 0,
      returnRate: totalDispatches > 0 ? (returnedCount / totalDispatches) * 100 : 0,
      totalExpectedCOD,
      deliveredCOD,
      totalCourierFees,
      netExpectedPayout: Math.max(0, deliveredCOD - totalCourierFees),
      avgDeliveryDays: deliveredWithTimeCount > 0 ? totalDeliveryDays / deliveredWithTimeCount : 2.4,
    };
  }, [dispatches]);

  // ── City / Zone Analytics ────────────────────────────────────────────────
  const cityAnalytics = useMemo(() => {
    const map = new Map<string, {
      city: string; isDhaka: boolean;
      total: number; delivered: number; returned: number;
      totalCOD: number; totalDeliveryDays: number; deliveredWithTime: number;
    }>();

    dispatches.forEach((d) => {
      const order = d.orders;
      const rawCity = (order?.shipping_address?.city || (d.recipient_city === 1 ? "Dhaka" : "Other")).trim();
      const isDhaka = d.recipient_city === 1 || rawCity.toLowerCase().includes("dhaka");
      const city = isDhaka ? "Dhaka (Inside)" : rawCity || "Outside Dhaka";

      if (!map.has(city)) {
        map.set(city, { city, isDhaka, total: 0, delivered: 0, returned: 0, totalCOD: 0, totalDeliveryDays: 0, deliveredWithTime: 0 });
      }
      const item = map.get(city)!;
      item.total++;
      item.totalCOD += Number(order?.total_price) || 0;

      const isDelivered =
        order?.internal_status === "delivered" || Boolean(order?.delivered_at) ||
        (d.pathao_order_status || "").toLowerCase().includes("deliver");
      const isReturned =
        order?.internal_status === "returned" || Boolean(order?.returned_at) ||
        (d.pathao_order_status || "").toLowerCase().includes("return");

      if (isDelivered) {
        item.delivered++;
        if (d.dispatched_at && order?.delivered_at) {
          const diffDays = Math.max(0.5, (new Date(order.delivered_at).getTime() - new Date(d.dispatched_at).getTime()) / 86400000);
          item.totalDeliveryDays += diffDays;
          item.deliveredWithTime++;
        }
      } else if (isReturned) {
        item.returned++;
      }
    });

    return Array.from(map.values()).map((row) => ({
      ...row,
      deliveredRate: row.total > 0 ? (row.delivered / row.total) * 100 : 0,
      returnRate: row.total > 0 ? (row.returned / row.total) * 100 : 0,
      avgDays: row.deliveredWithTime > 0 ? row.totalDeliveryDays / row.deliveredWithTime : 2.5,
      isHighRisk: row.total >= 3 && (row.returned / row.total) * 100 >= 25,
    }));
  }, [dispatches]);

  const filteredCities = useMemo(() => {
    let list = cityAnalytics.filter((c) => {
      if (regionFilter === "dhaka" && !c.isDhaka) return false;
      if (regionFilter === "outside_dhaka" && c.isDhaka) return false;
      if (regionFilter === "high_risk" && !c.isHighRisk) return false;
      if (searchQuery) return c.city.toLowerCase().includes(searchQuery.toLowerCase());
      return true;
    });

    if (sortBy === "rate") list = [...list].sort((a, b) => b.deliveredRate - a.deliveredRate);
    else if (sortBy === "return") list = [...list].sort((a, b) => b.returnRate - a.returnRate);
    else list = [...list].sort((a, b) => b.total - a.total);

    return list;
  }, [cityAnalytics, regionFilter, searchQuery, sortBy]);

  const highRiskCount = cityAnalytics.filter((c) => c.isHighRisk).length;

  const handleExportCSV = () => {
    const headers = ["City/Zone", "Total", "Delivered", "Success Rate", "Returned", "Return Rate", "COD (BDT)", "Avg Days", "Risk"];
    const rows = filteredCities.map((c) => [
      `"${c.city}"`, c.total, c.delivered, `${c.deliveredRate.toFixed(1)}%`,
      c.returned, `${c.returnRate.toFixed(1)}%`, c.totalCOD, c.avgDays.toFixed(1),
      c.isHighRisk ? "High Risk" : "Healthy",
    ]);
    const csv = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `zone_analytics_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Analytics CSV exported");
  };

  return (
    <div className="space-y-5 pb-12">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/reports"
            className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors mb-2"
          >
            <ArrowLeft size={12} />
            Back to Reports
          </Link>
          <h1 className="text-2xl font-bold text-white tracking-tight">Delivery & COD Analytics</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Regional performance, return risk zones, and COD settlement overview.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/25 text-xs font-semibold rounded-xl transition-colors self-start sm:self-auto"
        >
          <Download size={14} />
          Export CSV
        </button>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Delivery Rate",
            value: `${metrics.deliveredRate.toFixed(1)}%`,
            sub: `${metrics.deliveredCount} of ${metrics.totalDispatches} dispatches`,
            icon: CheckCircle2,
            color: "text-emerald-400",
            border: "border-emerald-500/20",
            bg: "bg-emerald-500/5",
            bar: metrics.deliveredRate,
            barColor: "bg-emerald-500",
          },
          {
            label: "Return Rate",
            value: `${metrics.returnRate.toFixed(1)}%`,
            sub: `${metrics.returnedCount} returned parcels`,
            icon: RotateCcw,
            color: "text-rose-400",
            border: "border-rose-500/20",
            bg: "bg-rose-500/5",
            bar: metrics.returnRate,
            barColor: "bg-rose-500",
          },
          {
            label: "Delivered COD",
            value: `৳${metrics.deliveredCOD.toLocaleString()}`,
            sub: `From ৳${metrics.totalExpectedCOD.toLocaleString()} dispatched`,
            icon: Banknote,
            color: "text-indigo-400",
            border: "border-indigo-500/20",
            bg: "bg-indigo-500/5",
            bar: metrics.totalExpectedCOD > 0 ? (metrics.deliveredCOD / metrics.totalExpectedCOD) * 100 : 0,
            barColor: "bg-indigo-500",
          },
          {
            label: "Net Settlement Est.",
            value: `৳${metrics.netExpectedPayout.toLocaleString()}`,
            sub: `Courier fees ≈ ৳${metrics.totalCourierFees.toLocaleString()}`,
            icon: Truck,
            color: "text-amber-400",
            border: "border-amber-500/20",
            bg: "bg-amber-500/5",
            bar: null,
            barColor: "",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className={`rounded-2xl p-4 border ${kpi.border} ${kpi.bg} hover:-translate-y-0.5 transition-all duration-200`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">{kpi.label}</span>
              <kpi.icon className={`w-4 h-4 ${kpi.color} opacity-70`} />
            </div>
            <p className={`text-2xl font-bold ${kpi.color} leading-none`}>{kpi.value}</p>
            <p className="text-[10px] text-zinc-500 mt-2">{kpi.sub}</p>
            {kpi.bar !== null && (
              <div className="mt-3 h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${kpi.barColor} rounded-full transition-all duration-1000`}
                  style={{ width: `${Math.min(kpi.bar, 100)}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── Secondary Stats ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
            <Truck className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">In Transit</p>
            <p className="text-xl font-bold text-sky-400 mt-0.5">{metrics.inTransitCount}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">active parcels</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Avg Delivery Time</p>
            <p className="text-xl font-bold text-violet-400 mt-0.5">{metrics.avgDeliveryDays.toFixed(1)} days</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">from dispatch to delivered</p>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">High-Risk Zones</p>
            <p className="text-xl font-bold text-rose-400 mt-0.5">{highRiskCount}</p>
            <p className="text-[10px] text-zinc-600 mt-0.5">≥25% return rate</p>
          </div>
        </div>
      </div>

      {/* ── Filters + Table ── */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 overflow-hidden">

        {/* Table Header Bar */}
        <div className="px-5 py-4 border-b border-zinc-800/60 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-zinc-100">Zone & City Performance</h2>
            <span className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono">
              {filteredCities.length} zones
            </span>
          </div>

          {/* Search + Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city..."
                className="pl-8 pr-3 py-1.5 bg-zinc-800/80 border border-zinc-700/60 rounded-lg text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 w-36"
              />
            </div>

            {/* Region filter pills */}
            {(["all", "dhaka", "outside_dhaka", "high_risk"] as const).map((f) => {
              const label = f === "all" ? "All" : f === "dhaka" ? "Dhaka" : f === "outside_dhaka" ? "Outside" : "High Risk";
              const active = regionFilter === f;
              const isRisk = f === "high_risk";
              return (
                <button
                  key={f}
                  onClick={() => setRegionFilter(f)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors whitespace-nowrap ${
                    active
                      ? isRisk ? "bg-rose-600 text-white" : "bg-indigo-600 text-white"
                      : isRisk ? "bg-zinc-800 text-rose-400 hover:text-rose-300" : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {isRisk && <ShieldAlert size={11} />}
                  {label}
                </button>
              );
            })}

            {/* Sort */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-zinc-800 border border-zinc-700/60 text-zinc-300 text-[11px] rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              <option value="total">Sort: Volume</option>
              <option value="rate">Sort: Success Rate</option>
              <option value="return">Sort: Return Rate</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/40 border-b border-zinc-800/60 text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
              <tr>
                <th className="py-3 px-5">City / Zone</th>
                <th className="py-3 px-4 text-center">Dispatches</th>
                <th className="py-3 px-4 text-center">Delivered</th>
                <th className="py-3 px-4 text-center">Success Rate</th>
                <th className="py-3 px-4 text-center">Return Rate</th>
                <th className="py-3 px-4 text-center">Avg Days</th>
                <th className="py-3 px-4 text-right">COD Value</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40">
              {filteredCities.map((row, idx) => {
                const successColor =
                  row.deliveredRate >= 70 ? "text-emerald-400" :
                  row.deliveredRate >= 50 ? "text-amber-400" : "text-rose-400";
                const returnColor = row.returnRate >= 25 ? "text-rose-400" : "text-zinc-400";

                return (
                  <tr key={idx} className="hover:bg-zinc-800/30 transition-colors group">
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.isDhaka ? "bg-indigo-500" : "bg-zinc-600"}`} />
                        <span className="font-medium text-zinc-100 text-xs">{row.city}</span>
                        {row.isDhaka && (
                          <span className="text-[9px] text-indigo-400 font-semibold bg-indigo-500/10 px-1.5 py-0.5 rounded-full">Dhaka</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-zinc-300">{row.total}</td>
                    <td className="py-3.5 px-4 text-center font-mono text-emerald-400 font-semibold">{row.delivered}</td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`font-bold text-xs ${successColor}`}>{row.deliveredRate.toFixed(1)}%</span>
                        <div className="w-12 h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${row.deliveredRate >= 70 ? "bg-emerald-500" : row.deliveredRate >= 50 ? "bg-amber-500" : "bg-rose-500"}`}
                            style={{ width: `${row.deliveredRate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className={`font-semibold ${returnColor}`}>{row.returnRate.toFixed(1)}%</span>
                    </td>
                    <td className="py-3.5 px-4 text-center text-zinc-400 font-mono">
                      {row.deliveredWithTime > 0 ? `${row.avgDays.toFixed(1)}d` : "—"}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-zinc-200">
                      ৳{row.totalCOD.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {row.isHighRisk ? (
                        <span className="inline-flex items-center gap-1 bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          <AlertTriangle size={9} />
                          High Risk
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
                          <TrendingUp size={9} />
                          Healthy
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredCities.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-zinc-500 text-sm">
                    No zones match the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        {filteredCities.length > 0 && (
          <div className="px-5 py-3 border-t border-zinc-800/60 flex items-center justify-between">
            <span className="text-[10px] text-zinc-500">
              Showing {filteredCities.length} of {cityAnalytics.length} zones
            </span>
            <div className="flex items-center gap-4 text-[10px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> ≥70% success
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> 50–70%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> &lt;50%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── High Risk Alert Panel (only if any exist) ── */}
      {highRiskCount > 0 && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center shrink-0">
              <TrendingDown className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-rose-300">High Return Risk Zones</h3>
              <p className="text-[11px] text-rose-400/70 mt-0.5">
                {highRiskCount} zone{highRiskCount > 1 ? "s" : ""} with ≥25% return rate — consider restricting COD for these areas
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {cityAnalytics.filter((c) => c.isHighRisk).map((c) => (
              <div key={c.city} className="rounded-xl bg-rose-500/8 border border-rose-500/20 px-3 py-2.5">
                <p className="text-xs font-semibold text-rose-200 truncate">{c.city}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-rose-400">{c.returnRate.toFixed(1)}% returns</span>
                  <span className="text-[10px] text-zinc-500">{c.total} orders</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
