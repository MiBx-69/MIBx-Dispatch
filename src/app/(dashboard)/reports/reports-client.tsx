"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBstDate, findMatchingMonth, getBstToday, type MonthInfo } from "@/lib/date-utils";
import { subDays } from "date-fns";
import {
  Download, BarChart3, ShoppingCart, Truck, CheckCircle2, XCircle,
  RotateCcw, TrendingUp, Award, FileSpreadsheet, FileText, Loader2,
  ChevronRight, Calendar, Clock,
} from "lucide-react";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { PathaoReconciliationWidget } from "@/components/dashboard/pathao-reconciliation-widget";
import { MonthReportBar } from "@/components/dashboard/month-report-bar";
import type { UnifiedReportMetrics } from "@/lib/reporting-engine";
import { formatPdfCurrency, cleanPdfText } from "@/lib/report-formatters";
import { cn } from "@/lib/utils";

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
  unifiedMetrics: UnifiedReportMetrics;
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
  unifiedMetrics,
}: ReportsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [viewMode, setViewMode] = useState<"courier" | "shopify">("courier");
  const [filterType, setFilterType] = useState(initialFilterType);
  const [startDate, setStartDate] = useState(formatBstDate(initialStartDate));
  const [endDate, setEndDate] = useState(formatBstDate(initialEndDate));
  const [customStartInput, setCustomStartInput] = useState(formatBstDate(initialStartDate));
  const [customEndInput, setCustomEndInput] = useState(formatBstDate(initialEndDate));
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingDispatched, setIsExportingDispatched] = useState(false);
  const [isExportingReturns, setIsExportingReturns] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  useEffect(() => {
    setFilterType(initialFilterType);
    const s = formatBstDate(initialStartDate);
    const e = formatBstDate(initialEndDate);
    setStartDate(s);
    setEndDate(e);
    setCustomStartInput(s);
    setCustomEndInput(e);
  }, [initialFilterType, initialStartDate, initialEndDate]);

  const applyFilter = (type: string, customStart?: string, customEnd?: string) => {
    setFilterType(type);
    let newStart = startDate;
    let newEnd = endDate;
    const now = new Date();

    if (type === "today") {
      newStart = newEnd = formatBstDate(now);
    } else if (type === "yesterday") {
      newStart = newEnd = formatBstDate(subDays(now, 1));
    } else if (type === "last_7_days") {
      newStart = formatBstDate(subDays(now, 6));
      newEnd = formatBstDate(now);
    } else if (type === "this_week") {
      const nowBst = new Date();
      const dtf = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", year: "numeric", month: "numeric", day: "numeric" });
      const parts = dtf.formatToParts(nowBst);
      const year = parseInt(parts.find((p) => p.type === "year")!.value);
      const month = parseInt(parts.find((p) => p.type === "month")!.value);
      const day = parseInt(parts.find((p) => p.type === "day")!.value);
      const nowUtc = new Date(Date.UTC(year, month - 1, day));
      const dayOfWeek = nowUtc.getUTCDay();
      const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(Date.UTC(year, month - 1, day + diff));
      newStart = formatBstDate(monday);
      newEnd = formatBstDate(now);
    } else if (type === "this_month") {
      const dtf = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", year: "numeric", month: "numeric" });
      const parts = dtf.formatToParts(now);
      const year = parseInt(parts.find((p) => p.type === "year")!.value);
      const month = parseInt(parts.find((p) => p.type === "month")!.value);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const pad = (n: number) => n.toString().padStart(2, "0");
      newStart = `${year}-${pad(month)}-01`;
      newEnd = `${year}-${pad(month)}-${pad(lastDay)}`;
    } else if (type === "last_month") {
      const dtf = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", year: "numeric", month: "numeric" });
      const parts = dtf.formatToParts(now);
      const year = parseInt(parts.find((p) => p.type === "year")!.value);
      const month = parseInt(parts.find((p) => p.type === "month")!.value);
      const lastMonthDate = new Date(Date.UTC(year, month - 2, 1));
      const lmYear = lastMonthDate.getUTCFullYear();
      const lmMonth = lastMonthDate.getUTCMonth() + 1;
      const lastDayOfLm = new Date(Date.UTC(lmYear, lmMonth, 0)).getUTCDate();
      const pad = (n: number) => n.toString().padStart(2, "0");
      newStart = `${lmYear}-${pad(lmMonth)}-01`;
      newEnd = `${lmYear}-${pad(lmMonth)}-${pad(lastDayOfLm)}`;
    } else if (type === "last_30_days") {
      newStart = formatBstDate(subDays(now, 29));
      newEnd = formatBstDate(now);
    } else if (type === "custom") {
      newStart = customStart || customStartInput || startDate;
      newEnd = customEnd || customEndInput || endDate;
      if (newStart > newEnd) {
        const temp = newStart;
        newStart = newEnd;
        newEnd = temp;
      }
    }

    setStartDate(newStart);
    setEndDate(newEnd);
    setCustomStartInput(newStart);
    setCustomEndInput(newEnd);

    startTransition(() => {
      const params = new URLSearchParams();
      params.set("filterType", type);
      params.set("startDate", newStart);
      params.set("endDate", newEnd);
      router.push(`/reports?${params.toString()}`);
    });
  };

  const handleSelectMonth = (month: MonthInfo) => {
    setFilterType("custom");
    setStartDate(month.startDate);
    setEndDate(month.endDate);
    setCustomStartInput(month.startDate);
    setCustomEndInput(month.endDate);

    startTransition(() => {
      const params = new URLSearchParams();
      params.set("filterType", "custom");
      params.set("startDate", month.startDate);
      params.set("endDate", month.endDate);
      router.push(`/reports?${params.toString()}`);
    });
  };

  const handleSelectYearToDate = (year: number) => {
    const { month: currMonth, day: currDay } = getBstToday();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const newStart = `${year}-01-01`;
    const newEnd = `${year}-${pad(currMonth)}-${pad(currDay)}`;

    setFilterType("custom");
    setStartDate(newStart);
    setEndDate(newEnd);
    setCustomStartInput(newStart);
    setCustomEndInput(newEnd);

    startTransition(() => {
      const params = new URLSearchParams();
      params.set("filterType", "custom");
      params.set("startDate", newStart);
      params.set("endDate", newEnd);
      router.push(`/reports?${params.toString()}`);
    });
  };

  const download = async (
    url: string,
    filename: string,
    setLoading: (b: boolean) => void
  ) => {
    try {
      setLoading(true);
      const res = await fetch(`${url}?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const link = document.createElement("a");
      link.href = window.URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(link.href);
    } catch {
      alert("Failed to export. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportSummaryPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTableModule = await import("jspdf-autotable");
      const autoTable = autoTableModule.default || autoTableModule;
      const doc = new jsPDF();
      const primary: [number, number, number] = [99, 102, 241];
      const dark: [number, number, number] = [30, 30, 35];
      const pw = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();

      // Header Banner
      doc.setFillColor(...dark);
      doc.rect(0, 0, pw, 42, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20).setTextColor(255, 255, 255);
      doc.text(cleanPdfText(companyName), 14, 18);
      const matchedMonth = findMatchingMonth(startDate, endDate);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10).setTextColor(200, 200, 200);
      doc.text(
        matchedMonth
          ? `Sales & Operations Report — ${matchedMonth.name} ${matchedMonth.year}`
          : "Sales & Operations Report",
        14,
        28
      );
      doc.setFontSize(9).setTextColor(210, 210, 210);
      doc.text(`Period: ${startDate} to ${endDate}`, pw - 14, 18, { align: "right" });
      doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}`, pw - 14, 28, { align: "right" });

      const aov = Math.round(totalGross / Math.max(1, orderStats.totalOrders));

      // Key Performance Indicators Table
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13).setTextColor(40, 40, 40);
      doc.text("Key Performance Indicators", 14, 54);
      autoTable(doc, {
        startY: 58,
        head: [["Metric", "Value"]],
        body: [
          ["Total Orders", Number(orderStats.totalOrders || 0).toLocaleString("en-US")],
          ["Dispatched", Number(orderStats.dispatchedOrders || 0).toLocaleString("en-US")],
          ["Delivered", Number(orderStats.deliveredOrders || 0).toLocaleString("en-US")],
          ["Returned", Number(orderStats.returnedOrders || 0).toLocaleString("en-US")],
          ["Cancelled", Number(orderStats.cancelledOrders || 0).toLocaleString("en-US")],
          ["Delivery Success Rate", `${successRate}%`],
          ["Average Order Value", formatPdfCurrency(aov)],
        ],
        theme: "grid",
        headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10 },
        styles: { font: "helvetica", fontSize: 10, cellPadding: 5, textColor: [40, 40, 40] },
        columnStyles: {
          0: { fontStyle: "normal" },
          1: { halign: "right", fontStyle: "bold" },
        },
        alternateRowStyles: { fillColor: [248, 248, 250] },
        margin: { left: 14, right: 14 },
      });

      // Financial Overview Table
      const finY = (doc as any).lastAutoTable.finalY + 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13).setTextColor(40, 40, 40);
      doc.text("Financial Overview", 14, finY);
      autoTable(doc, {
        startY: finY + 4,
        head: [["Financial Metric", "Amount (BDT)"]],
        body: [
          ["Total Gross Revenue", formatPdfCurrency(totalGross)],
          ["Delivered Revenue (Collected)", formatPdfCurrency(deliveredRevenue)],
          ["Pending Delivery Amount", formatPdfCurrency(pendingDeliveryAmount)],
          ["Returned Value (Lost)", formatPdfCurrency(returnedRevenue)],
          ["Cancelled Value", formatPdfCurrency(cancelledRevenue)],
        ],
        theme: "grid",
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 10 },
        styles: { font: "helvetica", fontSize: 10, cellPadding: 5, textColor: [40, 40, 40] },
        columnStyles: {
          0: { fontStyle: "normal" },
          1: { halign: "right", fontStyle: "bold" },
        },
        alternateRowStyles: { fillColor: [248, 248, 250] },
        margin: { left: 14, right: 14 },
      });

      // Top Selling Products Table
      if (topProducts.length > 0) {
        let prodY = (doc as any).lastAutoTable.finalY;
        if (prodY > 210) {
          doc.addPage();
          prodY = 20;
        } else {
          prodY += 12;
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13).setTextColor(40, 40, 40);
        doc.text("Top Selling Products", 14, prodY);
        autoTable(doc, {
          startY: prodY + 4,
          head: [["#", "Product", "Qty Sold", "Revenue (BDT)"]],
          body: topProducts.slice(0, 10).map((p: any, i: number) => [
            `#${i + 1}`,
            cleanPdfText(p.title),
            Number(p.qty || 0).toLocaleString("en-US"),
            formatPdfCurrency(p.revenue),
          ]),
          theme: "grid",
          headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 9 },
          styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: [40, 40, 40] },
          columnStyles: {
            0: { halign: "center", cellWidth: 14 },
            1: { fontStyle: "normal" },
            2: { halign: "right", cellWidth: 26 },
            3: { halign: "right", cellWidth: 42, fontStyle: "bold" },
          },
          alternateRowStyles: { fillColor: [248, 248, 250] },
          margin: { left: 14, right: 14 },
        });
      }

      // Page Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const ph = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
        doc.setDrawColor(220, 220, 225).setLineWidth(0.5).line(14, ph - 14, pw - 14, ph - 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8).setTextColor(140, 140, 140);
        doc.text(`Generated by ${cleanPdfText(systemName)}`, 14, ph - 9);
        doc.text(`Page ${i} of ${pageCount}`, pw - 14, ph - 9, { align: "right" });
      }
      const pdfPeriodTag = matchedMonth ? `${matchedMonth.name}-${matchedMonth.year}` : `${startDate}-to-${endDate}`;
      doc.save(`${cleanPdfText(companyName).replace(/\s+/g, "-")}-Report-${pdfPeriodTag}.pdf`);
    } catch {
      alert("Failed to generate PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const aov = Math.round(totalGross / Math.max(1, orderStats.totalOrders));
  const netRevenue = Math.max(0, totalGross - returnedRevenue - cancelledRevenue);
  const maxProdQty = Math.max(...topProducts.map((p: any) => p.qty || 0), 1);
  const maxDispQty = Math.max(...topDispatched.map((p: any) => p.qty || 0), 1);

  // Courier logistics calculations (1:1 with Pathao)
  const courierTotalParcels = unifiedMetrics.courierActiveTotalCount || unifiedMetrics.dispatchedCount || orderStats.dispatchedOrders;
  const courierDeliveredCount = unifiedMetrics.courierDeliveredCount;
  const courierDeliveredVal = unifiedMetrics.courierDeliveredValue || deliveredRevenue;
  const courierPaidReturnCount = unifiedMetrics.courierPaidReturnCount;
  const courierPaidReturnVal = unifiedMetrics.courierPaidReturnValue;
  const courierReturnedCount = unifiedMetrics.courierReturnedCount;
  const courierReturnedVal = unifiedMetrics.courierReturnedValue;
  const courierProcessingCount = unifiedMetrics.courierProcessingCount;
  const courierProcessingVal = unifiedMetrics.courierProcessingValue;
  const courierTotalVal = unifiedMetrics.courierActiveTotalValue || totalDispatchedAmount;

  const courierDeliveredPct = courierTotalParcels > 0 ? ((courierDeliveredCount / courierTotalParcels) * 100).toFixed(1) : "0";
  const courierPaidReturnPct = courierTotalParcels > 0 ? ((courierPaidReturnCount / courierTotalParcels) * 100).toFixed(1) : "0";
  const courierReturnedPct = courierTotalParcels > 0 ? ((courierReturnedCount / courierTotalParcels) * 100).toFixed(1) : "0";
  const courierProcessingPct = courierTotalParcels > 0 ? ((courierProcessingCount / courierTotalParcels) * 100).toFixed(1) : "0";

  const finalizedCourierOrders = courierDeliveredCount + courierReturnedCount;
  const courierSuccessRate = finalizedCourierOrders > 0
    ? Math.round((courierDeliveredCount / finalizedCourierOrders) * 100)
    : courierDeliveredCount > 0 ? 100 : 0;

  const FILTER_LABELS: Record<string, string> = {
    today: "Today", yesterday: "Yesterday", this_week: "This Week",
    last_7_days: "Last 7 Days", this_month: "This Month", last_month: "Last Month", last_30_days: "Last 30 Days", custom: "Custom",
  };

  const matchedMonth = findMatchingMonth(startDate, endDate);
  const displayPeriodLabel = matchedMonth
    ? `${matchedMonth.name} ${matchedMonth.year}`
    : (FILTER_LABELS[filterType] || filterType);

  return (
    <div className="space-y-5 pb-12">

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">Reports & Analytics</h1>
            <Link
              href="/reports/analytics"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-full text-[11px] font-semibold transition-colors"
            >
              <TrendingUp size={11} />
              Zone & COD
              <ChevronRight size={11} />
            </Link>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            {displayPeriodLabel} · {startDate} → {endDate}
          </p>
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Period filter */}
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={filterType}
              onChange={(e) => applyFilter(e.target.value)}
              disabled={isPending}
              className="pl-8 pr-3 py-2 bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs rounded-lg appearance-none focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
            >
              {matchedMonth && filterType === "custom" && (
                <option value="custom">Month: {matchedMonth.name} {matchedMonth.year}</option>
              )}
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_week">This Week</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              {(!matchedMonth || filterType !== "custom") && (
                <option value="custom">Custom Range</option>
              )}
            </select>
          </div>

          {filterType === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customStartInput}
                onChange={(e) => setCustomStartInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilter("custom", customStartInput, customEndInput);
                }}
                className="bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-500"
              />
              <span className="text-zinc-600 text-xs">→</span>
              <input
                type="date"
                value={customEndInput}
                onChange={(e) => setCustomEndInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilter("custom", customStartInput, customEndInput);
                }}
                className="bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => applyFilter("custom", customStartInput, customEndInput)}
                disabled={isPending || !customStartInput || !customEndInput}
                className="px-2.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          )}

          {isPending && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
        </div>
      </div>

      {/* ── Month-Wise Report Bar ────────────────────────────────────────── */}
      <MonthReportBar
        startDate={startDate}
        endDate={endDate}
        filterType={filterType}
        isPending={isPending}
        onSelectMonth={handleSelectMonth}
        onSelectYearToDate={handleSelectYearToDate}
      />

      {/* ── View Mode Selector: Courier Settlement vs Storefront Orders ────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/80 border border-zinc-800/80 p-2.5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-1.5 p-1 bg-zinc-950/70 border border-zinc-800/60 rounded-xl">
          <button
            type="button"
            onClick={() => setViewMode("courier")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
              viewMode === "courier"
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/25"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <Truck className="w-3.5 h-3.5" />
            Pathao Courier Settlement
            <span className={cn("px-1.5 py-0.2 rounded text-[10px] font-bold", viewMode === "courier" ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400")}>
              {courierTotalParcels}
            </span>
          </button>
          
          <button
            type="button"
            onClick={() => setViewMode("shopify")}
            className={cn(
              "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
              viewMode === "shopify"
                ? "bg-indigo-600 text-white shadow-sm shadow-indigo-500/25"
                : "text-zinc-400 hover:text-zinc-200"
            )}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            Shopify Storefront Orders
            <span className={cn("px-1.5 py-0.2 rounded text-[10px] font-bold", viewMode === "shopify" ? "bg-white/20 text-white" : "bg-zinc-800 text-zinc-400")}>
              {orderStats.totalOrders}
            </span>
          </button>
        </div>

        <p className="text-xs text-zinc-400 px-2 font-medium">
          {viewMode === "courier" 
            ? "Showing verified Pathao courier consignments, collections & returns" 
            : "Showing all Shopify storefront customer orders (including cancellations)"}
        </p>
      </div>

      {/* ── Export Bar ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 px-4 py-3 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mr-1">Export</span>

        <button
          onClick={() => download("/api/reports/export-all", `MiBx-All-${startDate}-${endDate}.csv`, setIsExportingAll)}
          disabled={isExportingAll || isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white text-xs font-semibold rounded-lg shadow-sm shadow-indigo-500/20 transition-all disabled:opacity-50"
        >
          {isExportingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
          All-in-One CSV
        </button>

        <button
          onClick={handleExportSummaryPdf}
          disabled={isGeneratingPdf || isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/25 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {isGeneratingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
          Summary PDF
        </button>

        <div className="w-px h-4 bg-zinc-700/60 mx-0.5" />

        <button
          onClick={() => download("/api/reports/export", `orders-${startDate}-${endDate}.csv`, setIsExporting)}
          disabled={isExporting || isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/50 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Orders
        </button>

        <button
          onClick={() => download("/api/reports/export-dispatched", `dispatched-${startDate}-${endDate}.csv`, setIsExportingDispatched)}
          disabled={isExportingDispatched || isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/50 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isExportingDispatched ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Truck className="w-3.5 h-3.5" />}
          Dispatched
        </button>

        <button
          onClick={() => download("/api/reports/export-returns", `returns-${startDate}-${endDate}.csv`, setIsExportingReturns)}
          disabled={isExportingReturns || isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border border-zinc-700/50 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          {isExportingReturns ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          Returns
        </button>
      </div>

      {/* ── KPI Strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(viewMode === "courier" ? [
          { label: "Total Consignments", value: courierTotalParcels, sub: `Booked ৳${Number(courierTotalVal).toLocaleString()}`, icon: Truck, color: "text-sky-400", border: "border-sky-500/20", bg: "bg-sky-500/5" },
          { label: "Delivered", value: courierDeliveredCount, sub: `৳${Number(courierDeliveredVal).toLocaleString()} (${courierDeliveredPct}%)`, icon: CheckCircle2, color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-500/5" },
          { label: "Paid Return", value: courierPaidReturnCount, sub: `৳${Number(courierPaidReturnVal).toLocaleString()} (${courierPaidReturnPct}%)`, icon: RotateCcw, color: "text-blue-400", border: "border-blue-500/20", bg: "bg-blue-500/5" },
          { label: "Returned", value: courierReturnedCount, sub: `৳${Number(courierReturnedVal).toLocaleString()} (${courierReturnedPct}%)`, icon: RotateCcw, color: "text-rose-400", border: "border-rose-500/20", bg: "bg-rose-500/5" },
          { label: "Processing", value: courierProcessingCount, sub: `৳${Number(courierProcessingVal).toLocaleString()} in transit`, icon: Clock, color: "text-amber-400", border: "border-amber-500/20", bg: "bg-amber-500/5" },
        ] : [
          { label: "Total Orders", value: orderStats.totalOrders, sub: `AOV ৳${aov.toLocaleString()}`, icon: ShoppingCart, color: "text-sky-400", border: "border-sky-500/20", bg: "bg-sky-500/5" },
          { label: "Dispatched", value: orderStats.dispatchedOrders, sub: `৳${Number(totalDispatchedAmount).toLocaleString()}`, icon: Truck, color: "text-indigo-400", border: "border-indigo-500/20", bg: "bg-indigo-500/5" },
          { label: "Delivered", value: orderStats.deliveredOrders, sub: `৳${Number(deliveredRevenue).toLocaleString()}`, icon: CheckCircle2, color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-500/5" },
          { label: "Returned", value: orderStats.returnedOrders, sub: `৳${Number(returnedRevenue).toLocaleString()} lost`, icon: RotateCcw, color: "text-rose-400", border: "border-rose-500/20", bg: "bg-rose-500/5" },
          { label: "Cancelled", value: orderStats.cancelledOrders, sub: `৳${Number(cancelledRevenue).toLocaleString()}`, icon: XCircle, color: "text-zinc-400", border: "border-zinc-700/40", bg: "bg-zinc-800/40" },
        ]).map((kpi) => (
          <div key={kpi.label} className={`rounded-2xl p-4 border ${kpi.border} ${kpi.bg} hover:-translate-y-0.5 transition-all duration-200`}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">{kpi.label}</span>
              <kpi.icon className={`w-4 h-4 ${kpi.color} opacity-70`} />
            </div>
            <p className={`text-2xl font-bold ${kpi.color} leading-none`}>{kpi.value}</p>
            <p className="text-[10px] text-zinc-500 mt-2 truncate">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Financial Summary ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-zinc-100">
            {viewMode === "courier" ? "Pathao Courier Financial Settlement" : "Storefront Financial Summary"}
          </h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {(viewMode === "courier" ? [
            { label: "Total Booked Value", value: courierTotalVal, color: "text-white", note: "Pathao active consignments" },
            { label: "Delivered (Remittance)", value: courierDeliveredVal, color: "text-emerald-400", note: "Courier remittance value" },
            { label: "Paid Return Collections", value: courierPaidReturnVal, color: "text-blue-400", note: "Return delivery fees/COD" },
            { label: "Lost to Returns", value: courierReturnedVal, color: "text-rose-400", note: "Full returned parcel value" },
            { label: "Delivery Processing", value: courierProcessingVal, color: "text-amber-400", note: "In transit / delivery hub" },
          ] : [
            { label: "Gross Revenue", value: totalGross, color: "text-white", note: "All Shopify orders" },
            { label: "Delivered (Collected)", value: deliveredRevenue, color: "text-emerald-400", note: "Delivered order value" },
            { label: "Pending Delivery", value: pendingDeliveryAmount, color: "text-amber-400", note: "In transit" },
            { label: "Lost to Returns", value: returnedRevenue, color: "text-rose-400", note: "Returned order value" },
            { label: "Net Collectible", value: netRevenue, color: "text-indigo-400", note: "Gross − returns − cancelled" },
          ]).map((f) => (
            <div key={f.label} className="rounded-xl p-3.5 bg-zinc-950/50 border border-zinc-800/50">
              <p className="text-[10px] font-medium text-zinc-500 mb-1.5">{f.label}</p>
              <p className={`text-lg font-bold ${f.color} leading-none truncate`}>
                ৳{Number(f.value).toLocaleString()}
              </p>
              <p className="text-[10px] text-zinc-600 mt-1.5">{f.note}</p>
            </div>
          ))}
        </div>

        {/* Success Rate Bar */}
        <div className="mt-4 pt-4 border-t border-zinc-800/60">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Award className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-zinc-300">
                {viewMode === "courier" ? "Pathao Delivery Success Rate" : "Store Delivery Success Rate"}
              </span>
            </div>
            <span className="text-sm font-bold text-indigo-400">
              {viewMode === "courier" ? courierSuccessRate : successRate}%
            </span>
          </div>
          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-1000"
              style={{ width: `${viewMode === "courier" ? courierSuccessRate : successRate}%` }}
            />
          </div>
          <p className="text-[10px] text-zinc-500 mt-1.5">
            {viewMode === "courier"
              ? `${courierDeliveredCount} delivered / ${courierTotalParcels} total consignments (${courierDeliveredPct}% delivery rate)`
              : `${orderStats.deliveredOrders} delivered / ${orderStats.deliveredOrders + orderStats.returnedOrders} finalized orders`}
          </p>
        </div>
      </div>

      {/* ── Revenue Chart & Pathao Courier Settlement ───────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* Revenue Trend */}
        <div className="xl:col-span-7 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Revenue Trend</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Daily order value over selected period</p>
              </div>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> w/ Delivery
                </span>
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> w/o Delivery
                </span>
              </div>
            </div>
            <div className="h-72">
              <RevenueChart data={revenueData} />
            </div>
          </div>
        </div>

        {/* Pathao Reconciliation Widget */}
        <div className="xl:col-span-5">
          <PathaoReconciliationWidget metrics={unifiedMetrics} />
        </div>
      </div>

      {/* ── Products Side by Side ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top Selling */}
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-zinc-100">Top Selling Products</h2>
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">By qty sold</span>
          </div>
          {topProducts.length === 0 ? (
            <p className="text-center text-zinc-500 text-sm py-10">No product data for this period.</p>
          ) : (
            <div className="space-y-3.5">
              {topProducts.slice(0, 8).map((p: any, i: number) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-zinc-600 w-5 shrink-0">#{i + 1}</span>
                      <p className="text-sm font-medium text-zinc-200 truncate">{p.title}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pl-3">
                      <span className="text-xs text-zinc-400">{p.qty} sold</span>
                      <span className="text-sm font-bold text-emerald-400">৳{Math.round(p.revenue).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-1000"
                      style={{ width: `${(p.qty / maxProdQty) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Most Dispatched */}
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-zinc-100">Most Dispatched Products</h2>
            <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">By dispatch volume</span>
          </div>
          {topDispatched.length === 0 ? (
            <p className="text-center text-zinc-500 text-sm py-10">No dispatch data for this period.</p>
          ) : (
            <div className="space-y-3.5">
              {topDispatched.slice(0, 8).map((p: any, i: number) => (
                <div key={p.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-zinc-600 w-5 shrink-0">#{i + 1}</span>
                      <p className="text-sm font-medium text-zinc-200 truncate">{p.title}</p>
                    </div>
                    <span className="text-sm font-bold text-sky-400 shrink-0 pl-3">{p.qty} units</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all duration-1000"
                      style={{ width: `${(p.qty / maxDispQty) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
