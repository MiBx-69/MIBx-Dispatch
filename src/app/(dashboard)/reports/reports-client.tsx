"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatBstDate } from "@/lib/date-utils";
import { subDays } from "date-fns";
import {
  Download, BarChart3, ShoppingCart, Truck, CheckCircle2, XCircle,
  RotateCcw, TrendingUp, Award, FileSpreadsheet, FileText, Loader2,
  ChevronRight, Calendar,
} from "lucide-react";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
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
  const [isExportingDispatched, setIsExportingDispatched] = useState(false);
  const [isExportingReturns, setIsExportingReturns] = useState(false);
  const [isExportingAll, setIsExportingAll] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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
      newStart = formatBstDate(subDays(now, 7));
      newEnd = formatBstDate(now);
    } else if (type === "this_week") {
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      newStart = formatBstDate(new Date(now.setDate(diff)));
      newEnd = formatBstDate(new Date());
    } else if (type === "this_month") {
      const dtf = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", year: "numeric", month: "numeric" });
      const parts = dtf.formatToParts(now);
      const year = parseInt(parts.find((p) => p.type === "year")!.value);
      const month = parseInt(parts.find((p) => p.type === "month")!.value);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const pad = (n: number) => n.toString().padStart(2, "0");
      newStart = `${year}-${pad(month)}-01`;
      newEnd = `${year}-${pad(month)}-${pad(lastDay)}`;
    } else if (type === "last_30_days") {
      newStart = formatBstDate(subDays(now, 30));
      newEnd = formatBstDate(now);
    } else if (type === "custom") {
      newStart = customStart || startDate;
      newEnd = customEnd || endDate;
    }

    const MIN = "2026-09-01";
    if (newStart < MIN) newStart = MIN;
    if (newEnd < MIN) newEnd = MIN;

    setStartDate(newStart);
    setEndDate(newEnd);

    startTransition(() => {
      const params = new URLSearchParams();
      params.set("startDate", new Date(`${newStart}T00:00:00+06:00`).toISOString());
      params.set("endDate", new Date(`${newEnd}T23:59:59.999+06:00`).toISOString());
      params.set("filterType", type);
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
      const startIso = new Date(`${startDate}T00:00:00+06:00`).toISOString();
      const endIso = new Date(`${endDate}T23:59:59.999+06:00`).toISOString();
      const res = await fetch(`${url}?startDate=${startIso}&endDate=${endIso}`);
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

  const handleExportSummaryPdf = () => {
    setIsGeneratingPdf(true);
    try {
      const doc = new jsPDF();
      const primary: [number, number, number] = [99, 102, 241];
      const dark: [number, number, number] = [30, 30, 35];
      const pw = doc.internal.pageSize.width || doc.internal.pageSize.getWidth();

      doc.setFillColor(...dark);
      doc.rect(0, 0, pw, 40, "F");
      doc.setFontSize(22).setTextColor(255, 255, 255);
      doc.text(companyName, 14, 20);
      doc.setFontSize(11).setTextColor(180, 180, 180);
      doc.text("Sales & Operations Report", 14, 30);
      doc.setFontSize(9);
      doc.text(`Period: ${startDate} to ${endDate}`, pw - 14, 20, { align: "right" });
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, pw - 14, 28, { align: "right" });

      const aov = Math.round(totalGross / Math.max(1, orderStats.totalOrders));

      doc.setFontSize(13).setTextColor(40, 40, 40);
      doc.text("Key Performance Indicators", 14, 52);
      autoTable(doc, {
        startY: 56,
        head: [["Metric", "Value"]],
        body: [
          ["Total Orders", orderStats.totalOrders.toString()],
          ["Dispatched", orderStats.dispatchedOrders.toString()],
          ["Delivered", orderStats.deliveredOrders.toString()],
          ["Returned", orderStats.returnedOrders.toString()],
          ["Cancelled", orderStats.cancelledOrders.toString()],
          ["Delivery Success Rate", `${successRate}%`],
          ["Average Order Value", `৳${aov.toLocaleString()}`],
        ],
        theme: "grid",
        headStyles: { fillColor: primary, textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 10, cellPadding: 5 },
        alternateRowStyles: { fillColor: [248, 248, 250] },
        margin: { left: 14 },
      });

      doc.setFontSize(13).setTextColor(40, 40, 40);
      doc.text("Financial Overview", 14, (doc as any).lastAutoTable.finalY + 14);
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 18,
        head: [["Financial Metric", "Amount (BDT)"]],
        body: [
          ["Total Gross Revenue", `৳${Math.round(totalGross).toLocaleString()}`],
          ["Delivered Revenue (Collected)", `৳${Math.round(deliveredRevenue).toLocaleString()}`],
          ["Pending Delivery Amount", `৳${Math.round(pendingDeliveryAmount).toLocaleString()}`],
          ["Returned Value (Lost)", `৳${Math.round(returnedRevenue).toLocaleString()}`],
          ["Cancelled Value", `৳${Math.round(cancelledRevenue).toLocaleString()}`],
        ],
        theme: "grid",
        headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], fontStyle: "bold" },
        styles: { fontSize: 10, cellPadding: 5 },
        alternateRowStyles: { fillColor: [248, 248, 250] },
        margin: { left: 14 },
      });

      if (topProducts.length > 0) {
        let finalY = (doc as any).lastAutoTable.finalY;
        if (finalY > 220) { doc.addPage(); finalY = 20; } else finalY += 14;
        doc.setFontSize(13).setTextColor(40, 40, 40);
        doc.text("Top Selling Products", 14, finalY);
        autoTable(doc, {
          startY: finalY + 4,
          head: [["#", "Product", "Qty Sold", "Revenue"]],
          body: topProducts.slice(0, 10).map((p: any, i: number) => [
            `#${i + 1}`, p.title, p.qty.toString(), `৳${Math.round(p.revenue).toLocaleString()}`,
          ]),
          theme: "grid",
          headStyles: { fillColor: [245, 158, 11], textColor: [255, 255, 255], fontStyle: "bold" },
          styles: { fontSize: 9, cellPadding: 4 },
          alternateRowStyles: { fillColor: [248, 248, 250] },
          margin: { left: 14 },
        });
      }

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        const ph = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
        doc.setDrawColor(200, 200, 200).setLineWidth(0.5).line(14, ph - 15, pw - 14, ph - 15);
        doc.setFontSize(8).setTextColor(150, 150, 150);
        doc.text(`Generated by ${systemName}`, 14, ph - 10);
        doc.text(`Page ${i} of ${pageCount}`, pw - 14, ph - 10, { align: "right" });
      }
      doc.save(`${companyName.replace(/\s+/g, "-")}-Report-${startDate}-to-${endDate}.pdf`);
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

  const FILTER_LABELS: Record<string, string> = {
    today: "Today", yesterday: "Yesterday", this_week: "This Week",
    last_7_days: "Last 7 Days", this_month: "This Month", last_30_days: "Last 30 Days", custom: "Custom",
  };

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
            {FILTER_LABELS[filterType] || filterType} · {startDate} → {endDate}
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
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_week">This Week</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="this_month">This Month</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {filterType === "custom" && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={startDate} min="2026-09-01"
                onChange={(e) => applyFilter("custom", e.target.value, endDate)}
                className="bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-500" />
              <span className="text-zinc-600 text-xs">→</span>
              <input type="date" value={endDate} min="2026-09-01"
                onChange={(e) => applyFilter("custom", startDate, e.target.value)}
                className="bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:border-indigo-500" />
            </div>
          )}

          {isPending && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />}
        </div>
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
        {[
          { label: "Total Orders", value: orderStats.totalOrders, sub: `AOV ৳${aov.toLocaleString()}`, icon: ShoppingCart, color: "text-sky-400", border: "border-sky-500/20", bg: "bg-sky-500/5" },
          { label: "Dispatched", value: orderStats.dispatchedOrders, sub: `৳${Number(totalDispatchedAmount).toLocaleString()}`, icon: Truck, color: "text-indigo-400", border: "border-indigo-500/20", bg: "bg-indigo-500/5" },
          { label: "Delivered", value: orderStats.deliveredOrders, sub: `৳${Number(deliveredRevenue).toLocaleString()}`, icon: CheckCircle2, color: "text-emerald-400", border: "border-emerald-500/20", bg: "bg-emerald-500/5" },
          { label: "Returned", value: orderStats.returnedOrders, sub: `৳${Number(returnedRevenue).toLocaleString()} lost`, icon: RotateCcw, color: "text-rose-400", border: "border-rose-500/20", bg: "bg-rose-500/5" },
          { label: "Cancelled", value: orderStats.cancelledOrders, sub: `৳${Number(cancelledRevenue).toLocaleString()}`, icon: XCircle, color: "text-zinc-400", border: "border-zinc-700/40", bg: "bg-zinc-800/40" },
        ].map((kpi) => (
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
          <h2 className="text-sm font-semibold text-zinc-100">Financial Summary</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Gross Revenue", value: totalGross, color: "text-white", note: "All orders" },
            { label: "Delivered (Collected)", value: deliveredRevenue, color: "text-emerald-400", note: "Confirmed revenue" },
            { label: "Pending Delivery", value: pendingDeliveryAmount, color: "text-amber-400", note: "In transit" },
            { label: "Lost to Returns", value: returnedRevenue, color: "text-rose-400", note: "Returned value" },
            { label: "Net Collectible", value: netRevenue, color: "text-indigo-400", note: "Gross − returns − cancelled" },
          ].map((f) => (
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
              <span className="text-xs font-semibold text-zinc-300">Delivery Success Rate</span>
            </div>
            <span className="text-sm font-bold text-indigo-400">{successRate}%</span>
          </div>
          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-1000"
              style={{ width: `${successRate}%` }}
            />
          </div>
          <p className="text-[10px] text-zinc-500 mt-1.5">
            {orderStats.deliveredOrders} delivered / {orderStats.deliveredOrders + orderStats.returnedOrders} finalized orders
          </p>
        </div>
      </div>

      {/* ── Revenue Chart ────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5">
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
