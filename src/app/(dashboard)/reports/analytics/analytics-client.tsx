"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp, Truck, CheckCircle2, RotateCcw, AlertTriangle,
  DollarSign, Download, ArrowLeft, Search, Filter, ShieldAlert
} from "lucide-react";
import { toast } from "sonner";

interface AnalyticsClientProps {
  dispatches: any[];
}

export function AnalyticsClient({ dispatches }: AnalyticsClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState<"all" | "dhaka" | "outside_dhaka" | "high_risk">("all");

  // Calculate Overall COD & Delivery Metrics
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
          const diffMs = new Date(order.delivered_at).getTime() - new Date(d.dispatched_at).getTime();
          const diffDays = Math.max(0.5, diffMs / (1000 * 60 * 60 * 24));
          totalDeliveryDays += diffDays;
          deliveredWithTimeCount++;
        }
      } else if (isReturned) {
        returnedCount++;
      } else {
        inTransitCount++;
      }
    });

    const deliveredRate = totalDispatches > 0 ? (deliveredCount / totalDispatches) * 100 : 0;
    const returnRate = totalDispatches > 0 ? (returnedCount / totalDispatches) * 100 : 0;
    const avgDeliveryDays = deliveredWithTimeCount > 0 ? totalDeliveryDays / deliveredWithTimeCount : 2.4;
    const netExpectedPayout = deliveredCOD - totalCourierFees;

    return {
      totalDispatches,
      deliveredCount,
      returnedCount,
      inTransitCount,
      deliveredRate,
      returnRate,
      totalExpectedCOD,
      deliveredCOD,
      totalCourierFees,
      netExpectedPayout,
      avgDeliveryDays,
    };
  }, [dispatches]);

  // Group by City / Region
  const cityAnalytics = useMemo(() => {
    const map = new Map<string, {
      city: string;
      isDhaka: boolean;
      total: number;
      delivered: number;
      returned: number;
      totalCOD: number;
      totalDeliveryDays: number;
      deliveredWithTime: number;
    }>();

    dispatches.forEach((d) => {
      const order = d.orders;
      const rawCity = (order?.shipping_address?.city || (d.recipient_city === 1 ? "Dhaka" : "Other")).trim();
      const isDhaka = d.recipient_city === 1 || rawCity.toLowerCase().includes("dhaka");
      const normalizedCity = isDhaka ? "Dhaka (Inside)" : (rawCity || "Outside Dhaka");

      if (!map.has(normalizedCity)) {
        map.set(normalizedCity, {
          city: normalizedCity,
          isDhaka,
          total: 0,
          delivered: 0,
          returned: 0,
          totalCOD: 0,
          totalDeliveryDays: 0,
          deliveredWithTime: 0,
        });
      }

      const item = map.get(normalizedCity)!;
      item.total++;
      item.totalCOD += Number(order?.total_price) || 0;

      const isDelivered =
        order?.internal_status === "delivered" ||
        Boolean(order?.delivered_at) ||
        (d.pathao_order_status || "").toLowerCase().includes("deliver");

      const isReturned =
        order?.internal_status === "returned" ||
        Boolean(order?.returned_at) ||
        (d.pathao_order_status || "").toLowerCase().includes("return");

      if (isDelivered) {
        item.delivered++;
        if (d.dispatched_at && order?.delivered_at) {
          const diffMs = new Date(order.delivered_at).getTime() - new Date(d.dispatched_at).getTime();
          const diffDays = Math.max(0.5, diffMs / (1000 * 60 * 60 * 24));
          item.totalDeliveryDays += diffDays;
          item.deliveredWithTime++;
        }
      } else if (isReturned) {
        item.returned++;
      }
    });

    return Array.from(map.values()).map((row) => {
      const deliveredRate = row.total > 0 ? (row.delivered / row.total) * 100 : 0;
      const returnRate = row.total > 0 ? (row.returned / row.total) * 100 : 0;
      const avgDays = row.deliveredWithTime > 0 ? row.totalDeliveryDays / row.deliveredWithTime : 2.5;
      const isHighRisk = row.total >= 3 && returnRate >= 25;

      return {
        ...row,
        deliveredRate,
        returnRate,
        avgDays,
        isHighRisk,
      };
    }).sort((a, b) => b.total - a.total);
  }, [dispatches]);

  // Filtered Cities
  const filteredCities = useMemo(() => {
    return cityAnalytics.filter((c) => {
      if (regionFilter === "dhaka" && !c.isDhaka) return false;
      if (regionFilter === "outside_dhaka" && c.isDhaka) return false;
      if (regionFilter === "high_risk" && !c.isHighRisk) return false;
      if (searchQuery) {
        return c.city.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return true;
    });
  }, [cityAnalytics, regionFilter, searchQuery]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ["City/Zone", "Total Dispatches", "Delivered", "Delivered Rate %", "Returned", "Return Rate %", "Total COD (BDT)", "Avg Days"];
    const rows = filteredCities.map(c => [
      `"${c.city}"`,
      c.total,
      c.delivered,
      `${c.deliveredRate.toFixed(1)}%`,
      c.returned,
      `${c.returnRate.toFixed(1)}%`,
      c.totalCOD,
      c.avgDays.toFixed(1),
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `delivery_analytics_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Exported Analytics Report CSV");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link
              href="/reports"
              className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors"
            >
              <ArrowLeft size={13} />
              <span>Back to Reports</span>
            </Link>
          </div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2.5">
            <TrendingUp className="text-indigo-400" />
            <span>Delivery & COD Settlement Analytics</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Regional performance, return risk zones, and cash-on-delivery reconciliation.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <Download size={14} />
          <span>Export Analytics (CSV)</span>
        </button>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Delivered Rate */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Delivered Rate</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {metrics.deliveredRate.toFixed(1)}%
          </div>
          <p className="text-[11px] text-zinc-500">
            {metrics.deliveredCount} of {metrics.totalDispatches} dispatches
          </p>
        </div>

        {/* Return Rate */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Return Rate</span>
            <RotateCcw size={16} className="text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400">
            {metrics.returnRate.toFixed(1)}%
          </div>
          <p className="text-[11px] text-zinc-500">
            {metrics.returnedCount} returned parcels
          </p>
        </div>

        {/* Verified Delivered COD */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Delivered COD</span>
            <DollarSign size={16} className="text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-indigo-300">
            ৳{metrics.deliveredCOD.toLocaleString()}
          </div>
          <p className="text-[11px] text-zinc-500">
            From ৳{metrics.totalExpectedCOD.toLocaleString()} dispatched
          </p>
        </div>

        {/* Net Settlement Payout */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Net Courier Settlement</span>
            <Truck size={16} className="text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300">
            ৳{Math.max(0, metrics.netExpectedPayout).toLocaleString()}
          </div>
          <p className="text-[11px] text-zinc-500">
            Est. courier fees: ৳{metrics.totalCourierFees.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by city or zone..."
            className="w-full pl-9 pr-4 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setRegionFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              regionFilter === "all" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            All Regions
          </button>
          <button
            onClick={() => setRegionFilter("dhaka")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              regionFilter === "dhaka" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            Inside Dhaka
          </button>
          <button
            onClick={() => setRegionFilter("outside_dhaka")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
              regionFilter === "outside_dhaka" ? "bg-indigo-600 text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"
            }`}
          >
            Outside Dhaka
          </button>
          <button
            onClick={() => setRegionFilter("high_risk")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap flex items-center gap-1 ${
              regionFilter === "high_risk" ? "bg-rose-600 text-white" : "bg-zinc-800 text-rose-400 hover:text-rose-300"
            }`}
          >
            <ShieldAlert size={12} />
            <span>High Return Risk (&ge;25%)</span>
          </button>
        </div>
      </div>

      {/* Regional Analytics Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm text-zinc-100">Zone & City Performance</h3>
            <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-full font-mono">
              {filteredCities.length} Zones
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/50 text-zinc-400 border-b border-zinc-800 text-[11px] uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">City / Region</th>
                <th className="py-3 px-4 text-center">Dispatches</th>
                <th className="py-3 px-4 text-center">Delivered</th>
                <th className="py-3 px-4 text-center">Success Rate</th>
                <th className="py-3 px-4 text-center">Return Rate</th>
                <th className="py-3 px-4 text-center">Avg Delivery</th>
                <th className="py-3 px-4 text-right">Total COD</th>
                <th className="py-3 px-4 text-center">Risk Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {filteredCities.map((row, idx) => (
                <tr key={idx} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-zinc-100">
                    {row.city}
                  </td>
                  <td className="py-3 px-4 text-center font-mono">{row.total}</td>
                  <td className="py-3 px-4 text-center font-mono text-emerald-400">{row.delivered}</td>
                  <td className="py-3 px-4 text-center">
                    <span className="font-semibold text-emerald-400">
                      {row.deliveredRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`font-semibold ${row.returnRate >= 25 ? "text-rose-400" : "text-zinc-400"}`}>
                      {row.returnRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center text-zinc-400 font-mono">
                    {row.avgDays.toFixed(1)} days
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-zinc-200">
                    ৳{row.totalCOD.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.isHighRisk ? (
                      <span className="inline-flex items-center gap-1 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        <AlertTriangle size={10} /> High Risk
                      </span>
                    ) : (
                      <span className="inline-flex items-center bg-emerald-500/10 text-emerald-400 text-[10px] font-medium px-2 py-0.5 rounded-full">
                        Healthy
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {filteredCities.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-zinc-500">
                    No regions match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
