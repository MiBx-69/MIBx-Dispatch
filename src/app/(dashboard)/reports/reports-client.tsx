"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, subDays, startOfMonth } from "date-fns";
import { formatBstDate } from "@/lib/date-utils";
import { Download, Calendar, BarChart, ShoppingCart, Truck, CheckCircle, XCircle, RotateCcw, TrendingUp, Award, FileSpreadsheet, FileText } from "lucide-react";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { TopProducts } from "@/components/dashboard/top-products";
import { DispatchedProductsToday } from "@/components/dashboard/dispatched-today";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
  pendingDeliveryAmount: number;
  successRate: number;
  companyName: string;
  systemName: string;
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
  pendingDeliveryAmount,
  successRate,
  companyName,
  systemName,
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
    } else if (type === "this_week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
      const monday = new Date(now.setDate(diff));
      newStart = formatBstDate(monday);
      newEnd = formatBstDate(new Date());
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

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const handleExportSummaryPdf = () => {
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF();
      
      const primaryColor: [number, number, number] = [99, 102, 241]; 
      const darkBg: [number, number, number] = [30, 30, 35];
      const textColor: [number, number, number] = [40, 40, 40];
      const pageWidth = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();

      // Premium Header Banner
      doc.setFillColor(darkBg[0], darkBg[1], darkBg[2]);
      doc.rect(0, 0, pageWidth, 40, "F");

      doc.setFontSize(24);
      doc.setTextColor(255, 255, 255);
      doc.text(`${companyName}`, 14, 20);
      
      doc.setFontSize(12);
      doc.setTextColor(200, 200, 200);
      doc.text("Sales & Operations Report", 14, 30);
      
      // Right-aligned date
      doc.setFontSize(10);
      doc.setTextColor(200, 200, 200);
      doc.text(`Period: ${startDate} to ${endDate}`, pageWidth - 14, 20, { align: 'right' });
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth - 14, 28, { align: 'right' });

      // KPI Section
      doc.setFontSize(14);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text("Key Performance Indicators (KPIs)", 14, 52);

      const aov = Math.round(totalGross / Math.max(1, orderStats.totalOrders));

      autoTable(doc, {
        startY: 56,
        head: [["Metric", "Value"]],
        body: [
          ["Total Orders (Placed)", orderStats.totalOrders.toString()],
          ["Total Dispatched Orders", orderStats.dispatchedOrders.toString()],
          ["Total Delivered Orders", orderStats.deliveredOrders.toString()],
          ["Total Returned Orders", orderStats.returnedOrders.toString()],
          ["Delivery Success Rate", `${successRate}%`],
          ["Average Order Value (AOV)", `Tk ${aov.toLocaleString()}`],
        ],
        theme: "grid",
        headStyles: { fillColor: primaryColor, textColor: [255, 255, 255], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 5 },
        alternateRowStyles: { fillColor: [248, 248, 250] },
        margin: { left: 14 }
      });

      // Financial Overview
      doc.setFontSize(14);
      doc.setTextColor(textColor[0], textColor[1], textColor[2]);
      doc.text("Financial Overview", 14, (doc as any).lastAutoTable.finalY + 14);

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 18,
        head: [["Financial Metric", "Amount (BDT)"]],
        body: [
          ["Total Amount (Gross)", `Tk ${Math.round(totalGross).toLocaleString()}`],
          ["Total Delivered Amount", `Tk ${Math.round(deliveredRevenue).toLocaleString()}`],
          ["Pending Delivery Amount", `Tk ${Math.round(pendingDeliveryAmount).toLocaleString()}`]
        ],
        theme: "grid",
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: 'bold' }, 
        styles: { fontSize: 10, cellPadding: 5 },
        alternateRowStyles: { fillColor: [248, 248, 250] },
        margin: { left: 14 }
      });

      // Top Products Table
      if (topProducts && topProducts.length > 0) {
        let finalY = (doc as any).lastAutoTable.finalY;
        if (finalY > 220) {
          doc.addPage();
          finalY = 20;
        } else {
          finalY += 14;
        }

        doc.setFontSize(14);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text("Top Performing Products", 14, finalY);

        autoTable(doc, {
          startY: finalY + 4,
          head: [["Rank", "Product Name", "Quantity Sold", "Revenue (BDT)"]],
          body: topProducts.slice(0, 10).map((p: any, i: number) => [
            `#${i + 1}`,
            p.title, 
            (p.qty || 0).toString(), 
            `Tk ${Math.round(p.revenue || 0).toLocaleString()}`
          ]),
          theme: "grid",
          headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: 'bold' }, 
          styles: { fontSize: 9, cellPadding: 4 },
          alternateRowStyles: { fillColor: [248, 248, 250] },
          margin: { left: 14 }
        });
      }

      // Top Dispatched Products Table
      if (topDispatched && topDispatched.length > 0) {
        let finalY = (doc as any).lastAutoTable.finalY;
        if (finalY > 240) {
          doc.addPage();
          finalY = 20;
        } else {
          finalY += 14;
        }

        doc.setFontSize(14);
        doc.setTextColor(textColor[0], textColor[1], textColor[2]);
        doc.text("Top Dispatched Products", 14, finalY);

        autoTable(doc, {
          startY: finalY + 4,
          head: [["Rank", "Product Name", "Dispatched Volume"]],
          body: topDispatched.slice(0, 10).map((c: any, i: number) => [
            `#${i + 1}`,
            c.title || 'Unknown', 
            (c.qty || 0).toString()
          ]),
          theme: "grid",
          headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' }, 
          styles: { fontSize: 9, cellPadding: 4 },
          alternateRowStyles: { fillColor: [248, 248, 250] },
          margin: { left: 14 }
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
        
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
        
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(`Generated by ${systemName}`, 14, pageHeight - 10);
        doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
      }

      doc.save(`${companyName.replace(/\s+/g, "-")}-Sales-Report-${startDate}-to-${endDate}.pdf`);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Failed to generate PDF report.");
    } finally {
      setIsGeneratingPdf(false);
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
            <option value="this_week">This Week</option>
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
            {isExportingAll ? "Exporting Master..." : "All-in-One CSV"}
          </button>

          <button
            onClick={handleExportSummaryPdf}
            disabled={isGeneratingPdf || isPending}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 hover:text-white border border-orange-500/30 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
            title="Download Professional PDF Summary Report"
          >
            <FileText className="w-3.5 h-3.5" />
            {isGeneratingPdf ? "Generating..." : "Summary PDF"}
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
            <p className="text-xs font-medium text-zinc-400 mb-0.5">Total Amount</p>
            <p className="text-xl lg:text-2xl font-bold text-white truncate" title={`৳${Number(totalGross).toLocaleString()}`}>
              ৳{Number(totalGross).toLocaleString()}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5 leading-tight">All orders</p>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/20 p-3.5 rounded-xl flex flex-col justify-center">
            <p className="text-xs font-medium text-emerald-400/80 mb-0.5">Total Delivered Amount</p>
            <p className="text-xl lg:text-2xl font-bold text-emerald-400 truncate" title={`৳${Number(deliveredRevenue).toLocaleString()}`}>
              ৳{Number(deliveredRevenue).toLocaleString()}
            </p>
            <p className="text-[10px] text-emerald-400/60 mt-0.5 leading-tight truncate">
              Collected Revenue
            </p>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 p-3.5 rounded-xl flex flex-col justify-center">
            <p className="text-xs font-medium text-amber-400/80 mb-0.5">Pending Delivery Amount</p>
            <p className="text-xl lg:text-2xl font-bold text-amber-400 truncate" title={`৳${Number(pendingDeliveryAmount).toLocaleString()}`}>
              ৳{Number(pendingDeliveryAmount).toLocaleString()}
            </p>
            <p className="text-[10px] text-amber-400/60 mt-0.5 leading-tight">In transit</p>
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
