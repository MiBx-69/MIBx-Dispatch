"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, subDays, startOfMonth } from "date-fns";
import { Download, Calendar, BarChart, ShoppingCart, Truck, CheckCircle, XCircle, RotateCcw, TrendingUp, Award } from "lucide-react";
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
  const [startDate, setStartDate] = useState(format(new Date(initialStartDate), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(initialEndDate), "yyyy-MM-dd"));
  const [isExporting, setIsExporting] = useState(false);

  const applyFilter = (type: string, customStart?: string, customEnd?: string) => {
    setFilterType(type);
    
    let newStart = startDate;
    let newEnd = endDate;
    const now = new Date();

    if (type === "today") {
      newStart = format(now, "yyyy-MM-dd");
      newEnd = format(now, "yyyy-MM-dd");
    } else if (type === "yesterday") {
      const yest = subDays(now, 1);
      newStart = format(yest, "yyyy-MM-dd");
      newEnd = format(yest, "yyyy-MM-dd");
    } else if (type === "last_7_days") {
      newStart = format(subDays(now, 7), "yyyy-MM-dd");
      newEnd = format(now, "yyyy-MM-dd");
    } else if (type === "this_month") {
      newStart = format(startOfMonth(now), "yyyy-MM-dd");
      newEnd = format(now, "yyyy-MM-dd");
    } else if (type === "last_30_days") {
      newStart = format(subDays(now, 30), "yyyy-MM-dd");
      newEnd = format(now, "yyyy-MM-dd");
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
      // Use setHours to cover the entire day for DB query
      const startIso = new Date(`${newStart}T00:00:00`).toISOString();
      const endIso = new Date(`${newEnd}T23:59:59.999`).toISOString();
      
      params.set("startDate", startIso);
      params.set("endDate", endIso);
      params.set("filterType", type);
      router.push(`/reports?${params.toString()}`);
    });
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const startIso = new Date(`${startDate}T00:00:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999`).toISOString();
      
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
      const startIso = new Date(`${startDate}T00:00:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999`).toISOString();
      
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

  const handleExportReturns = async () => {
    try {
      setIsExportingReturns(true);
      const startIso = new Date(`${startDate}T00:00:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999`).toISOString();
      
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
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Header and Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart className="w-6 h-6 text-indigo-400" />
            Reports & Analytics
          </h1>
          <p className="text-sm text-zinc-400 mt-1">Generate custom reports and export data</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
          {/* Quick Filters */}
          <select 
            value={filterType}
            onChange={(e) => applyFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:border-indigo-500"
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
            <div className="flex items-center gap-2">
              <input 
                type="date"
                value={startDate}
                min="2026-09-01"
                onChange={(e) => applyFilter("custom", e.target.value, endDate)}
                className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-zinc-500">to</span>
              <input 
                type="date"
                value={endDate}
                min="2026-09-01"
                onChange={(e) => applyFilter("custom", startDate, e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={isExporting || isPending}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
            title="Export Orders"
          >
            <Download className="w-4 h-4" />
            {isExporting ? "Exporting..." : "Orders CSV"}
          </button>
          
          <button
            onClick={handleExportDispatched}
            disabled={isExportingDispatched || isPending}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
            title="Export Dispatched Products"
          >
            <Truck className="w-4 h-4" />
            {isExportingDispatched ? "Exporting..." : "Products CSV"}
          </button>

          <button
            onClick={handleExportReturns}
            disabled={isExportingReturns || isPending}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
            title="Export Returns"
          >
            <RotateCcw className="w-4 h-4" />
            {isExportingReturns ? "Exporting..." : "Returns CSV"}
          </button>
        </div>
      </div>

      {/* Primary Financial Summary — The accurate month-end numbers */}
      <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          Financial Summary
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <div className="bg-zinc-950/50 border border-zinc-800/50 p-4 lg:p-5 rounded-xl flex flex-col justify-center">
            <p className="text-xs lg:text-sm font-medium text-zinc-400 mb-1">Gross Revenue</p>
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-white truncate" title={`৳${Number(totalGross).toLocaleString()}`}>
              ৳{Number(totalGross).toLocaleString()}
            </p>
            <p className="text-[10px] lg:text-xs text-zinc-500 mt-1 leading-tight">All orders (with delivery)</p>
          </div>
          <div className="bg-rose-500/5 border border-rose-500/20 p-4 lg:p-5 rounded-xl flex flex-col justify-center">
            <p className="text-xs lg:text-sm font-medium text-rose-400/80 mb-1">Deductions</p>
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-rose-400 truncate" title={`-৳${Number(returnedRevenue + cancelledRevenue).toLocaleString()}`}>
              -৳{Number(returnedRevenue + cancelledRevenue).toLocaleString()}
            </p>
            <p className="text-[10px] lg:text-xs text-rose-400/60 mt-1 leading-tight">
              Returned: ৳{Number(returnedRevenue).toLocaleString()}
              {partialReturnDeductions > 0 && ` (incl. ৳${partialReturnDeductions.toLocaleString()} partial)`}
              {' '}• Cancelled: ৳{Number(cancelledRevenue).toLocaleString()}
            </p>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 lg:p-5 rounded-xl flex flex-col justify-center">
            <p className="text-xs lg:text-sm font-medium text-emerald-400/80 mb-1">Net Collectible</p>
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-emerald-400 truncate" title={`৳${Number(netCollectibleRevenue).toLocaleString()}`}>
              ৳{Number(netCollectibleRevenue).toLocaleString()}
            </p>
            <p className="text-[10px] lg:text-xs text-emerald-400/60 mt-1 leading-tight">Gross − Returns − Cancelled</p>
          </div>
          <div className="bg-indigo-500/5 border border-indigo-500/20 p-4 lg:p-5 rounded-xl flex flex-col justify-center">
            <p className="text-xs lg:text-sm font-medium text-indigo-400/80 mb-1">Success Rate</p>
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-indigo-400 flex items-center gap-2 truncate">
              <Award className="w-5 h-5 lg:w-6 lg:h-6 shrink-0" />
              {successRate}%
            </p>
            <p className="text-[10px] lg:text-xs text-indigo-400/60 mt-1 leading-tight">
              {orderStats.deliveredOrders} delivered / {orderStats.deliveredOrders + orderStats.returnedOrders} finalized
            </p>
          </div>
        </div>
      </div>

      {/* Order & Return Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4 lg:p-5 rounded-2xl flex flex-col justify-center">
          <p className="text-xs lg:text-sm font-medium text-zinc-400 mb-1">Total Orders</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-white flex items-center gap-2 truncate">
            <ShoppingCart className="w-4 h-4 lg:w-5 lg:h-5 text-zinc-500 shrink-0" />
            {orderStats.totalOrders}
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 lg:p-5 rounded-2xl flex flex-col justify-center">
          <p className="text-xs lg:text-sm font-medium text-zinc-400 mb-1">Dispatched</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-white flex items-center gap-2 truncate">
            <Truck className="w-4 h-4 lg:w-5 lg:h-5 text-indigo-400 shrink-0" />
            {orderStats.dispatchedOrders}
          </p>
          <p className="text-[10px] lg:text-xs text-indigo-400 mt-1 leading-tight">৳{Number(totalDispatchedAmount).toLocaleString()} Value</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 lg:p-5 rounded-2xl flex flex-col justify-center">
          <p className="text-xs lg:text-sm font-medium text-zinc-400 mb-1">Delivered</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-emerald-400 flex items-center gap-2 truncate">
            <CheckCircle className="w-4 h-4 lg:w-5 lg:h-5 shrink-0" />
            {orderStats.deliveredOrders}
          </p>
          <p className="text-[10px] lg:text-xs text-emerald-400/80 mt-1 leading-tight">৳{Number(deliveredRevenue).toLocaleString()}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 lg:p-5 rounded-2xl flex flex-col justify-center">
          <p className="text-xs lg:text-sm font-medium text-zinc-400 mb-1">Returned</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-rose-400 flex items-center gap-2 truncate">
            <RotateCcw className="w-4 h-4 lg:w-5 lg:h-5 shrink-0" />
            {orderStats.returnedOrders}
          </p>
          <p className="text-[10px] lg:text-xs text-rose-400/80 mt-1 leading-tight">
            ৳{Number(returnedRevenue).toLocaleString()} lost
            {totalReturnDeliveryFees > 0 && ` + ৳${Number(totalReturnDeliveryFees).toLocaleString()} fees`}
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 lg:p-5 rounded-2xl flex flex-col justify-center">
          <p className="text-xs lg:text-sm font-medium text-zinc-400 mb-1">Cancelled</p>
          <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-zinc-400 flex items-center gap-2 truncate">
            <XCircle className="w-4 h-4 lg:w-5 lg:h-5 shrink-0" />
            {orderStats.cancelledOrders}
          </p>
          <p className="text-[10px] lg:text-xs text-zinc-500 mt-1 leading-tight">৳{Number(cancelledRevenue).toLocaleString()}</p>
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
