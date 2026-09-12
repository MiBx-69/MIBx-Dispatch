"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, subDays, startOfMonth } from "date-fns";
import { formatBstDate } from "@/lib/date-utils";
import { Download, Calendar, BarChart, ShoppingCart, Truck, CheckCircle, XCircle, RotateCcw, TrendingUp, Award, FileSpreadsheet } from "lucide-react";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { TopProducts } from "@/components/dashboard/top-products";
import { DispatchedProductsToday } from "@/components/dashboard/dispatched-today";

interface ReportsClientProps {
  revenueData: any[];
  topProducts: any[];
  topDispatched: any[];
  orderStats: {
    totalOrders: number;
    dispatchedOrders: number;
    deliveredOrders: number;
    cancelledOrders: number;
    returnedOrders: number;
  };
  totalGross: number;
  totalSubtotal: number;
  totalDispatchedAmount: number;
  returnedRevenue: number;
  cancelledRevenue: number;
  deliveredRevenue: number;
  netCollectibleRevenue: number;
  totalReturnDeliveryFees: number;
  partialReturnDeductions: number;
  successRate: number;
  initialStartDate: string;
  initialEndDate: string;
  initialFilterType: string;
}

export function ReportsClient({
  revenueData,
  topProducts,
  topDispatched,
  orderStats,
  totalGross,
  totalSubtotal,
  totalDispatchedAmount,
  returnedRevenue,
  cancelledRevenue,
  deliveredRevenue,
  netCollectibleRevenue,
  totalReturnDeliveryFees,
  partialReturnDeductions,
  successRate,
  initialStartDate,
  initialEndDate,
  initialFilterType,
}: ReportsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filterType, setFilterType] = useState(initialFilterType);
  const [startDate, setStartDate] = useState(formatBstDate(initialStartDate));
  const [endDate, setEndDate] = useState(formatBstDate(initialEndDate));
  const [isExporting, setIsExporting] = useState(false);

  const applyFilter = (type: string, customStart?: string, customEnd?: string) => {
    setFilterType(type);
    
    let newStart = startDate;
    let newEnd = endDate;
    const now = new Date();

    if (type === "today") {
      newStart = formatBstDate(now);
      newEnd = formatBstDate(now);
    } else if (type === "yesterday") {
      const yest = subDays(now, 1);
      newStart = formatBstDate(yest);
      newEnd = formatBstDate(yest);
    } else if (type === "last_7_days") {
      newStart = formatBstDate(subDays(now, 7));
      newEnd = formatBstDate(now);
    } else if (type === "this_month") {
      const dtf = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", year: "numeric", month: "numeric" });
      const parts = dtf.formatToParts(now);
      const year = parseInt(parts.find(p => p.type === "year")!.value);
      const month = parseInt(parts.find(p => p.type === "month")!.value);
      const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const pad = (n: number) => n.toString().padStart(2, "0");
      newStart = `${year}-${pad(month)}-01`;
      newEnd = `${year}-${pad(month)}-${pad(lastDayOfMonth)}`;
    } else if (type === "last_30_days") {
      newStart = formatBstDate(subDays(now, 30));
      newEnd = formatBstDate(now);
    } else if (type === "custom") {
      newStart = customStart || startDate;
      newEnd = customEnd || endDate;
    }

    const MIN_DATE_STR = "2026-09-01";
    if (newStart < MIN_DATE_STR) newStart = MIN_DATE_STR;
    if (newEnd < MIN_DATE_STR) newEnd = MIN_DATE_STR;

    setStartDate(newStart);
    setEndDate(newEnd);

    startTransition(() => {
      const params = new URLSearchParams();
      // Use Bangladesh (+06:00) time boundaries to ensure correct local dates
      const startIso = new Date(`${newStart}T00:00:00+06:00`).toISOString();
      const endIso = new Date(`${newEnd}T23:59:59.999+06:00`).toISOString();
      
      params.set("startDate", startIso);
      params.set("endDate", endIso);
      params.set("filterType", type);
      router.push(`/reports?${params.toString()}`);
    });
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const startIso = new Date(`${startDate}T00:00:00+06:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999+06:00`).toISOString();
      
      const res = await fetch(`/api/reports/export?startDate=${startIso}&endDate=${endIso}`);
      if (!res.ok) throw new Error("Failed to generate CSV");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `orders-report-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      console.error(err);
      alert("Failed to export report.");
    } finally {
      setIsExporting(false);
    }
  };

  const [isExportingDispatched, setIsExportingDispatched] = useState(false);

  const handleExportDispatched = async () => {
    try {
      setIsExportingDispatched(true);
      const startIso = new Date(`${startDate}T00:00:00+06:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999+06:00`).toISOString();
      
      const res = await fetch(`/api/reports/export-dispatched?startDate=${startIso}&endDate=${endIso}`);
      if (!res.ok) throw new Error("Failed to generate CSV");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dispatched-products-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      console.error(err);
      alert("Failed to export dispatched products.");
    } finally {
      setIsExportingDispatched(false);
    }
  };

  const [isExportingReturns, setIsExportingReturns] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);

  const handleExportAll = async () => {
    try {
      setIsExportingAll(true);
      const startIso = new Date(`${startDate}T00:00:00+06:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999+06:00`).toISOString();
      
      const res = await fetch(`/api/reports/export-all?startDate=${startIso}&endDate=${endIso}`);
      if (!res.ok) {
        if (res.status === 404) {
          alert("No data found for the selected period.");
          return;
        }
        throw new Error("Failed to generate All-in-One Report");
      }
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MiBx-All-In-One-Report-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      console.error(err);
      alert("Failed to export All-in-One Report.");
    } finally {
      setIsExportingAll(false);
    }
  };

  const handleExportReturns = async () => {
    try {
      setIsExportingReturns(true);
      const startIso = new Date(`${startDate}T00:00:00+06:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999+06:00`).toISOString();
      
      const res = await fetch(`/api/reports/export-returns?startDate=${startIso}&endDate=${endIso}`);
      if (!res.ok) throw new Error("Failed to generate CSV");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `returns-report-${startDate}-to-${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (err) {
      console.error(err);
      alert("Failed to export returns.");
    } finally {
      setIsExportingReturns(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in pb-12">
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <BarChart className="w-5 h-5 text-indigo-400" />
              Reports & Analytics
            </h1>
            <Link
              href="/reports/analytics"
              className="px-3 py-1 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <TrendingUp size={13} />
              <span>Zone & COD Analytics &rarr;</span>
            </Link>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">Generate custom reports and export data</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {/* Quick Filters */}
          <select 
            value={filterType}
            onChange={(e) => applyFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
            disabled={isPending}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="this_month">This Month</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="custom">Custom Range</option>
          </select>

          {/* Custom Date Inputs */}
          {filterType === "custom" && (
            <div className="flex items-center gap-1.5">
              <input 
                type="date"
                value={startDate}
                min="2026-09-01"
                onChange={(e) => applyFilter("custom", e.target.value, endDate)}
                className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-zinc-500 text-xs">to</span>
              <input 
                type="date"
                value={endDate}
                min="2026-09-01"
                onChange={(e) => applyFilter("custom", startDate, e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* All-in-One Master Report Export */}
          <button
            onClick={handleExportAll}
            disabled={isExportingAll || isPending}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 hover:from-indigo-600 hover:via-purple-600 hover:to-pink-600 text-white text-xs font-semibold rounded-lg shadow-md shadow-indigo-500/20 transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
            title="Export Complete All-in-One Report (Executive KPIs, Orders, Dispatches & Returns)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            {isExportingAll ? "Exporting Master..." : "All-in-One Report"}
          </button>

          <div className="h-5 w-px bg-zinc-700/60 hidden sm:block mx-0.5" />

          {/* Section-by-Section Exports */}
          <button
            onClick={handleExport}
            disabled={isExporting || isPending}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            title="Export Orders CSV"
          >
            <Download className="w-3.5 h-3.5" />
            {isExporting ? "Exporting..." : "Orders CSV"}
          </button>
          
          <button
            onClick={handleExportDispatched}
            disabled={isExportingDispatched || isPending}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 hover:text-white border border-emerald-500/30 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            title="Export Dispatched Products CSV"
          >
            <Truck className="w-3.5 h-3.5" />
            {isExportingDispatched ? "Exporting..." : "Products CSV"}
          </button>

          <button
            onClick={handleExportReturns}
            disabled={isExportingReturns || isPending}
            className="flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-white border border-rose-500/30 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            title="Export Returns CSV"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {isExportingReturns ? "Exporting..." : "Returns CSV"}
          </button>
        </div>
      </div>

      {/* Primary Order KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {/* Total Orders */}
        <div className="bg-zinc-900 border border-indigo-500/25 hover:border-indigo-500/40 p-3.5 rounded-xl flex flex-col justify-between transition-all group shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Total Orders</span>
            <div className="w-6 h-6 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400">
              <ShoppingCart className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            {orderStats.totalOrders}
          </div>
          <span className="text-[10px] text-zinc-500 mt-1">Total period volume</span>
        </div>

        {/* Dispatched */}
        <div className="bg-zinc-900 border border-sky-500/25 hover:border-sky-500/40 p-3.5 rounded-xl flex flex-col justify-between transition-all group shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Dispatched</span>
            <div className="w-6 h-6 rounded-lg bg-sky-500/15 flex items-center justify-center text-sky-400">
              <Truck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-sky-400 tracking-tight">
            {orderStats.dispatchedOrders}
          </div>
          <span className="text-[10px] text-sky-400/80 mt-1 truncate" title={`৳${Number(totalDispatchedAmount).toLocaleString()}`}>
            ৳{Number(totalDispatchedAmount).toLocaleString()} Value
          </span>
        </div>

        {/* Delivered */}
        <div className="bg-zinc-900 border border-emerald-500/25 hover:border-emerald-500/40 p-3.5 rounded-xl flex flex-col justify-between transition-all group shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Delivered</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
              <CheckCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-emerald-400 tracking-tight">
            {orderStats.deliveredOrders}
          </div>
          <span className="text-[10px] text-emerald-400/80 mt-1 truncate" title={`৳${Number(deliveredRevenue).toLocaleString()}`}>
            ৳{Number(deliveredRevenue).toLocaleString()}
          </span>
        </div>

        {/* Returned */}
        <div className="bg-zinc-900 border border-rose-500/25 hover:border-rose-500/40 p-3.5 rounded-xl flex flex-col justify-between transition-all group shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Returned</span>
            <div className="w-6 h-6 rounded-lg bg-rose-500/15 flex items-center justify-center text-rose-400">
              <RotateCcw className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-rose-400 tracking-tight">
            {orderStats.returnedOrders}
          </div>
          <span className="text-[10px] text-rose-400/80 mt-1 truncate" title={`৳${Number(returnedRevenue).toLocaleString()} lost`}>
            ৳{Number(returnedRevenue).toLocaleString()} lost
          </span>
        </div>

        {/* Cancelled */}
        <div className="bg-zinc-900 border border-zinc-700/50 hover:border-zinc-600 p-3.5 rounded-xl flex flex-col justify-between transition-all group shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Cancelled</span>
            <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400">
              <XCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-zinc-300 tracking-tight">
            {orderStats.cancelledOrders}
          </div>
          <span className="text-[10px] text-zinc-500 mt-1 truncate" title={`৳${Number(cancelledRevenue).toLocaleString()}`}>
            ৳{Number(cancelledRevenue).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Primary Financial Summary — The accurate month-end numbers */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          Financial Summary
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          <div className="bg-zinc-950/50 border border-zinc-800/50 p-3.5 rounded-xl flex flex-col justify-center">
            <p className="text-xs font-medium text-zinc-400 mb-0.5">Gross Revenue</p>
            <p className="text-xl lg:text-2xl font-bold text-white truncate" title={`৳${Number(totalGross).toLocaleString()}`}>
              ৳{Number(totalGross).toLocaleString()}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">All orders (with delivery)</p>
          </div>
          <div className="bg-rose-500/5 border border-rose-500/20 p-3.5 rounded-xl flex flex-col justify-center">
            <p className="text-xs font-medium text-rose-400/80 mb-0.5">Deductions</p>
            <p className="text-xl lg:text-2xl font-bold text-rose-400 truncate" title={`-৳${Number(returnedRevenue + cancelledRevenue).toLocaleString()}`}>
              -৳{Number(returnedRevenue + cancelledRevenue).toLocaleString()}
            </p>
            <p className="text-[10px] text-rose-400/60 mt-0.5 leading-tight truncate">
              Returned: ৳{Number(returnedRevenue).toLocaleString()}
              {partialReturnDeductions > 0 && ` (incl. ৳${partialReturnDeductions.toLocaleString()} partial)`}
              {' '}• Cancelled: ৳{Number(cancelledRevenue).toLocaleString()}
            </p>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/20 p-3.5 rounded-xl flex flex-col justify-center">
            <p className="text-xs font-medium text-emerald-400/80 mb-0.5">Net Collectible</p>
            <p className="text-xl lg:text-2xl font-bold text-emerald-400 truncate" title={`৳${Number(netCollectibleRevenue).toLocaleString()}`}>
              ৳{Number(netCollectibleRevenue).toLocaleString()}
            </p>
            <p className="text-[10px] text-emerald-400/60 mt-0.5 leading-tight">Gross − Returns − Cancelled</p>
          </div>
          <div className="bg-indigo-500/5 border border-indigo-500/20 p-3.5 rounded-xl flex flex-col justify-center">
            <p className="text-xs font-medium text-indigo-400/80 mb-0.5">Success Rate</p>
            <p className="text-xl lg:text-2xl font-bold text-indigo-400 flex items-center gap-1.5 truncate">
              <Award className="w-5 h-5 shrink-0" />
              {successRate}%
            </p>
            <p className="text-[10px] text-indigo-400/60 mt-0.5 leading-tight">
              {orderStats.deliveredOrders} delivered / {orderStats.deliveredOrders + orderStats.returnedOrders} finalized
            </p>
          </div>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4">Revenue Trend</h2>
        <div className="h-72">
          <RevenueChart data={revenueData} />
        </div>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">Top Selling Products</h2>
          <TopProducts products={topProducts} />
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4">Most Dispatched Products</h2>
          <DispatchedProductsToday products={topDispatched} />
        </div>
      </div>
    </div>
  );
}
