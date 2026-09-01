"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format, subDays, startOfMonth } from "date-fns";
import { Download, Calendar, BarChart, ShoppingCart, Truck, CheckCircle, XCircle } from "lucide-react";
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
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
          <p className="text-sm font-medium text-zinc-400 mb-1">Total Revenue</p>
          <p className="text-3xl font-bold text-white">৳{Number(totalGross).toLocaleString()}</p>
          <p className="text-xs text-indigo-400 mt-1">Gross (With Delivery)</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
          <p className="text-sm font-medium text-zinc-400 mb-1">Net Revenue</p>
          <p className="text-3xl font-bold text-emerald-400">৳{Number(totalSubtotal).toLocaleString()}</p>
          <p className="text-xs text-emerald-400/80 mt-1">Subtotal (Without Delivery)</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
          <p className="text-sm font-medium text-zinc-400 mb-1">Total Orders</p>
          <p className="text-3xl font-bold text-white flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-zinc-500" />
            {orderStats.totalOrders}
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl">
          <p className="text-sm font-medium text-zinc-400 mb-1">Dispatched</p>
          <p className="text-3xl font-bold text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-indigo-400" />
            {orderStats.dispatchedOrders}
          </p>
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
