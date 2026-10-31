"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  formatBstDate,
  findMatchingMonth,
  getBstToday,
  type MonthInfo,
} from "@/lib/date-utils";
import { subDays } from "date-fns";
import {
  Download,
  BarChart3,
  ShoppingCart,
  Truck,
  CheckCircle2,
  XCircle,
  RotateCcw,
  TrendingUp,
  Award,
  FileSpreadsheet,
  FileText,
  Loader2,
  ChevronRight,
  Calendar,
  Clock,
  Package,
  Lock,
  Unlock,
  AlertTriangle,
  Search,
  DollarSign,
} from "lucide-react";
import { RevenueChart } from "@/components/dashboard/revenue-chart";
import { PathaoReconciliationWidget } from "@/components/dashboard/pathao-reconciliation-widget";
import { MonthReportBar } from "@/components/dashboard/month-report-bar";
import type { UnifiedReportMetrics } from "@/lib/reporting-engine";
import {
  generateBrandedBusinessPdf,
  type PdfReportType,
} from "@/lib/pdf-report-generator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  comprehensiveReport: any;
  previousReport: any;
  comparison: any;
}

export function ReportsClient({
  revenueData,
  topProducts,
  topDispatched,
  orderStats,
  totalGross,
  totalDispatchedAmount,
  returnedRevenue,
  cancelledRevenue,
  deliveredRevenue,
  pendingDeliveryAmount,
  successRate,
  companyName,
  initialStartDate,
  initialEndDate,
  initialFilterType,
  unifiedMetrics,
  comprehensiveReport,
  previousReport,
  comparison,
}: ReportsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<
    "overview" | "products" | "daily_closing" | "monthly_closing" | "exports"
  >("overview");
  const [viewMode, setViewMode] = useState<"courier" | "shopify">("courier");
  const [filterType, setFilterType] = useState(initialFilterType);
  const [startDate, setStartDate] = useState(formatBstDate(initialStartDate));
  const [endDate, setEndDate] = useState(formatBstDate(initialEndDate));
  const [customStartInput, setCustomStartInput] = useState(
    formatBstDate(initialStartDate)
  );
  const [customEndInput, setCustomEndInput] = useState(
    formatBstDate(initialEndDate)
  );

  // Product / SKU tab state
  const [productViewLevel, setProductViewLevel] = useState<"product" | "sku">(
    "product"
  );
  const [productSearch, setProductSearch] = useState("");
  const [productSortBy, setProductSortBy] = useState<
    "ordered" | "delivered" | "returned" | "return_rate"
  >("ordered");

  // Daily Closing tab state
  const [dailyDate, setDailyDate] = useState(() => {
    const t = getBstToday();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${t.year}-${pad(t.month)}-${pad(t.day)}`;
  });
  const [dailyData, setDailyData] = useState<any>(null);
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);
  const [dailyNotes, setDailyNotes] = useState("");
  const [isSavingDaily, setIsSavingDaily] = useState(false);

  // Monthly Closing tab state
  const [closingYear, setClosingYear] = useState(() => getBstToday().year);
  const [closingMonth, setClosingMonth] = useState(() => getBstToday().month);
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
  const [monthlyNotes, setMonthlyNotes] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [isSavingMonthly, setIsSavingMonthly] = useState(false);

  useEffect(() => {
    setFilterType(initialFilterType);
    const s = formatBstDate(initialStartDate);
    const e = formatBstDate(initialEndDate);
    setStartDate(s);
    setEndDate(e);
    setCustomStartInput(s);
    setCustomEndInput(e);
  }, [initialFilterType, initialStartDate, initialEndDate]);

  // Load daily closing when tab is active
  const fetchDailyClosing = async (dateStr: string) => {
    setIsLoadingDaily(true);
    try {
      const res = await fetch(`/api/closings/daily?date=${dateStr}`);
      const data = await res.json();
      if (res.ok) {
        setDailyData(data);
        setDailyNotes(data.existingClosing?.notes || "");
      }
    } catch {
      toast.error("Failed to load daily closing data");
    } finally {
      setIsLoadingDaily(false);
    }
  };

  useEffect(() => {
    if (activeTab === "daily_closing") {
      fetchDailyClosing(dailyDate);
    }
  }, [activeTab, dailyDate]);

  // Load monthly closing when tab is active
  const fetchMonthlyClosing = async (y: number, m: number) => {
    setIsLoadingMonthly(true);
    try {
      const res = await fetch(`/api/closings/monthly?year=${y}&month=${m}`);
      const data = await res.json();
      if (res.ok) {
        setMonthlyData(data);
        setMonthlyNotes(data.existingClosing?.notes || "");
      }
    } catch {
      toast.error("Failed to load monthly closing data");
    } finally {
      setIsLoadingMonthly(false);
    }
  };

  useEffect(() => {
    if (activeTab === "monthly_closing") {
      fetchMonthlyClosing(closingYear, closingMonth);
    }
  }, [activeTab, closingYear, closingMonth]);

  const handleSaveDailyClosing = async (
    status: "draft" | "approved" | "locked"
  ) => {
    setIsSavingDaily(true);
    try {
      const res = await fetch("/api/closings/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dailyDate,
          closing_status: status,
          notes: dailyNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save daily closing");
      toast.success(`Daily Closing Statement (${dailyDate}) marked as ${status.toUpperCase()}`);
      fetchDailyClosing(dailyDate);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSavingDaily(false);
    }
  };

  const handleMonthlyClosingAction = async (
    action: "save_or_lock" | "reopen",
    status?: "draft" | "approved" | "locked"
  ) => {
    setIsSavingMonthly(true);
    try {
      const res = await fetch("/api/closings/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          year: closingYear,
          month: closingMonth,
          closing_status: status,
          notes: monthlyNotes,
          reopen_reason: reopenReason,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to update monthly closing");
      toast.success(
        action === "reopen"
          ? "Monthly statement unlocked and audit logged"
          : `Monthly statement marked as ${(status || "locked").toUpperCase()}`
      );
      setReopenReason("");
      fetchMonthlyClosing(closingYear, closingMonth);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSavingMonthly(false);
    }
  };

  const applyFilter = (
    type: string,
    customStart?: string,
    customEnd?: string
  ) => {
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
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
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
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "numeric",
      });
      const parts = dtf.formatToParts(now);
      const year = parseInt(parts.find((p) => p.type === "year")!.value);
      const month = parseInt(parts.find((p) => p.type === "month")!.value);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const pad = (n: number) => n.toString().padStart(2, "0");
      newStart = `${year}-${pad(month)}-01`;
      newEnd = `${year}-${pad(month)}-${pad(lastDay)}`;
    } else if (type === "last_month") {
      const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "numeric",
      });
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

  const handleGeneratePdf = (reportType: PdfReportType) => {
    if (!comprehensiveReport) return;
    generateBrandedBusinessPdf({
      reportType,
      report: comprehensiveReport,
      comparison,
      periodLabel: `${startDate} to ${endDate}`,
      dailySummary: dailyData?.liveDailySummary,
    });
    toast.success(`Generated Universes RAW PDF: ${reportType.replace(/_/g, " ")}`);
  };

  const aov = Math.round(totalGross / Math.max(1, orderStats.totalOrders));
  const netRevenue = Math.max(0, totalGross - returnedRevenue - cancelledRevenue);
  const maxProdQty = Math.max(...topProducts.map((p: any) => p.qty || 0), 1);
  const maxDispQty = Math.max(...topDispatched.map((p: any) => p.qty || 0), 1);

  const courierTotalParcels =
    unifiedMetrics.courierActiveTotalCount ||
    unifiedMetrics.dispatchedCount ||
    orderStats.dispatchedOrders;
  const courierDeliveredCount = unifiedMetrics.courierDeliveredCount;
  const courierDeliveredVal =
    unifiedMetrics.courierDeliveredValue || deliveredRevenue;
  const courierPaidReturnCount = unifiedMetrics.courierPaidReturnCount;
  const courierPaidReturnVal = unifiedMetrics.courierPaidReturnValue;
  const courierReturnedCount = unifiedMetrics.courierReturnedCount;
  const courierReturnedVal = unifiedMetrics.courierReturnedValue;
  const courierProcessingCount = unifiedMetrics.courierProcessingCount;
  const courierProcessingVal = unifiedMetrics.courierProcessingValue;
  const courierTotalVal =
    unifiedMetrics.courierActiveTotalValue || totalDispatchedAmount;

  const courierDeliveredPct =
    courierTotalParcels > 0
      ? ((courierDeliveredCount / courierTotalParcels) * 100).toFixed(1)
      : "0";
  const courierPaidReturnPct =
    courierTotalParcels > 0
      ? ((courierPaidReturnCount / courierTotalParcels) * 100).toFixed(1)
      : "0";
  const courierReturnedPct =
    courierTotalParcels > 0
      ? ((courierReturnedCount / courierTotalParcels) * 100).toFixed(1)
      : "0";

  const finalizedCourierOrders = courierDeliveredCount + courierReturnedCount;
  const courierSuccessRate =
    finalizedCourierOrders > 0
      ? Math.round((courierDeliveredCount / finalizedCourierOrders) * 100)
      : courierDeliveredCount > 0
      ? 100
      : 0;

  const FILTER_LABELS: Record<string, string> = {
    today: "Today",
    yesterday: "Yesterday",
    this_week: "This Week",
    last_7_days: "Last 7 Days",
    this_month: "This Month",
    last_month: "Last Month",
    last_30_days: "Last 30 Days",
    custom: "Custom",
  };

  const matchedMonth = findMatchingMonth(startDate, endDate);
  const displayPeriodLabel = matchedMonth
    ? `${matchedMonth.name} ${matchedMonth.year}`
    : FILTER_LABELS[filterType] || filterType;

  const op = comprehensiveReport?.orderPerformance;
  const sp = comprehensiveReport?.salesPerformance;
  const rp = comprehensiveReport?.returnPerformance;
  const cp = comprehensiveReport?.courierPerformance;
  const fp = comprehensiveReport?.financialPerformance;
  const dp = comprehensiveReport?.deliveryPerformance;

  const activeProductRows = (
    productViewLevel === "product"
      ? comprehensiveReport?.productPerformance || []
      : comprehensiveReport?.skuPerformance || []
  )
    .filter((row: any) => {
      if (!productSearch) return true;
      const q = productSearch.toLowerCase();
      return (
        row.productTitle?.toLowerCase().includes(q) ||
        row.sku?.toLowerCase().includes(q) ||
        row.variantTitle?.toLowerCase().includes(q)
      );
    })
    .sort((a: any, b: any) => {
      if (productSortBy === "delivered")
        return b.deliveredQty - a.deliveredQty;
      if (productSortBy === "returned")
        return b.returnedQty - a.returnedQty;
      if (productSortBy === "return_rate")
        return b.unitReturnRate - a.unitReturnRate;
      return b.orderedQty - a.orderedQty;
    });

  return (
    <div className="space-y-5 pb-16">
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Business Reports, Closings & Export Center
            </h1>
            <Link
              href="/reports/analytics"
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 rounded-full text-[11px] font-semibold transition-colors"
            >
              <TrendingUp size={11} />
              Zone & COD Analytics
              <ChevronRight size={11} />
            </Link>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            {displayPeriodLabel} · {startDate} → {endDate} (Asia/Dhaka)
          </p>
        </div>

        {/* ── Controls ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Calendar className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={filterType}
              onChange={(e) => applyFilter(e.target.value)}
              disabled={isPending}
              className="pl-8 pr-3 py-2 bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs rounded-lg appearance-none focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
            >
              {matchedMonth && filterType === "custom" && (
                <option value="custom">
                  Month: {matchedMonth.name} {matchedMonth.year}
                </option>
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
                  if (e.key === "Enter")
                    applyFilter("custom", customStartInput, customEndInput);
                }}
                className="bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs rounded-lg px-2.5 py-2"
              />
              <span className="text-zinc-600 text-xs">→</span>
              <input
                type="date"
                value={customEndInput}
                onChange={(e) => setCustomEndInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    applyFilter("custom", customStartInput, customEndInput);
                }}
                className="bg-zinc-900 border border-zinc-700/60 text-zinc-200 text-xs rounded-lg px-2.5 py-2"
              />
              <button
                type="button"
                onClick={() =>
                  applyFilter("custom", customStartInput, customEndInput)
                }
                disabled={isPending || !customStartInput || !customEndInput}
                className="px-2.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          )}

          <button
            onClick={() => handleGeneratePdf("complete_monthly_report")}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-sm"
          >
            <FileText className="w-3.5 h-3.5" />
            Complete Monthly PDF
          </button>

          {isPending && (
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
          )}
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

      {/* ── 5-Tab Navigation ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
        {[
          {
            id: "overview",
            label: "1. Monthly Business Report",
            icon: BarChart3,
          },
          {
            id: "products",
            label: "2. Product & SKU Performance",
            icon: Package,
          },
          {
            id: "daily_closing",
            label: "3. Daily Closing Statement",
            icon: Calendar,
          },
          {
            id: "monthly_closing",
            label: "4. Month-End Closing System",
            icon: Lock,
          },
          {
            id: "exports",
            label: "5. Export Center (PDFs & CSVs)",
            icon: Download,
          },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === t.id
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20"
                : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: MONTHLY BUSINESS REPORT (ALL 18 MANAGEMENT QUESTIONS) */}
      {activeTab === "overview" && (
        <div className="space-y-5 animate-fade-in">
          {/* View Mode Selector: Courier Dispatches vs Storefront Orders */}
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
                Pathao Courier Parcels
                <span
                  className={cn(
                    "px-1.5 py-0.2 rounded text-[10px] font-bold",
                    viewMode === "courier"
                      ? "bg-white/20 text-white"
                      : "bg-zinc-800 text-zinc-400"
                  )}
                >
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
                <span
                  className={cn(
                    "px-1.5 py-0.2 rounded text-[10px] font-bold",
                    viewMode === "shopify"
                      ? "bg-white/20 text-white"
                      : "bg-zinc-800 text-zinc-400"
                  )}
                >
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

          {/* KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {(viewMode === "courier"
              ? [
                  {
                    label: "Total Consignments",
                    value: courierTotalParcels,
                    sub: `Booked ৳${Number(courierTotalVal).toLocaleString()}`,
                    icon: Truck,
                    color: "text-sky-400",
                    border: "border-sky-500/20",
                    bg: "bg-sky-500/5",
                  },
                  {
                    label: "Delivered",
                    value: courierDeliveredCount,
                    sub: `৳${Number(courierDeliveredVal).toLocaleString()} (${courierDeliveredPct}%)`,
                    icon: CheckCircle2,
                    color: "text-emerald-400",
                    border: "border-emerald-500/20",
                    bg: "bg-emerald-500/5",
                  },
                  {
                    label: "Paid Return",
                    value: courierPaidReturnCount,
                    sub: `৳${Number(courierPaidReturnVal).toLocaleString()} (${courierPaidReturnPct}%)`,
                    icon: RotateCcw,
                    color: "text-blue-400",
                    border: "border-blue-500/20",
                    bg: "bg-blue-500/5",
                  },
                  {
                    label: "Returned",
                    value: courierReturnedCount,
                    sub: `৳${Number(courierReturnedVal).toLocaleString()} (${courierReturnedPct}%)`,
                    icon: RotateCcw,
                    color: "text-rose-400",
                    border: "border-rose-500/20",
                    bg: "bg-rose-500/5",
                  },
                  {
                    label: "Processing",
                    value: courierProcessingCount,
                    sub: `৳${Number(courierProcessingVal).toLocaleString()} in transit`,
                    icon: Clock,
                    color: "text-amber-400",
                    border: "border-amber-500/20",
                    bg: "bg-amber-500/5",
                  },
                ]
              : [
                  {
                    label: "Total Orders",
                    value: orderStats.totalOrders,
                    sub: `AOV ৳${aov.toLocaleString()}`,
                    icon: ShoppingCart,
                    color: "text-sky-400",
                    border: "border-sky-500/20",
                    bg: "bg-sky-500/5",
                  },
                  {
                    label: "Dispatched",
                    value: orderStats.dispatchedOrders,
                    sub: `৳${Number(totalDispatchedAmount).toLocaleString()}`,
                    icon: Truck,
                    color: "text-indigo-400",
                    border: "border-indigo-500/20",
                    bg: "bg-indigo-500/5",
                  },
                  {
                    label: "Delivered",
                    value: orderStats.deliveredOrders,
                    sub: `৳${Number(deliveredRevenue).toLocaleString()}`,
                    icon: CheckCircle2,
                    color: "text-emerald-400",
                    border: "border-emerald-500/20",
                    bg: "bg-emerald-500/5",
                  },
                  {
                    label: "Returned",
                    value: orderStats.returnedOrders,
                    sub: `৳${Number(returnedRevenue).toLocaleString()} lost`,
                    icon: RotateCcw,
                    color: "text-rose-400",
                    border: "border-rose-500/20",
                    bg: "bg-rose-500/5",
                  },
                  {
                    label: "Cancelled",
                    value: orderStats.cancelledOrders,
                    sub: `৳${Number(cancelledRevenue).toLocaleString()}`,
                    icon: XCircle,
                    color: "text-zinc-400",
                    border: "border-zinc-700/40",
                    bg: "bg-zinc-800/40",
                  },
                ]
            ).map((kpi) => (
              <div
                key={kpi.label}
                className={`rounded-2xl p-4 border ${kpi.border} ${kpi.bg} hover:-translate-y-0.5 transition-all duration-200`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
                    {kpi.label}
                  </span>
                  <kpi.icon className={`w-4 h-4 ${kpi.color} opacity-70`} />
                </div>
                <p className={`text-2xl font-bold ${kpi.color} leading-none`}>
                  {kpi.value}
                </p>
                <p className="text-[10px] text-zinc-500 mt-2 truncate">
                  {kpi.sub}
                </p>
              </div>
            ))}
          </div>

          {/* Executive Summary Statement */}
          {op && sp && rp && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Section 1 & 2: Order & Sales Performance */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                  Order & Sales Performance
                </h3>
                <div className="divide-y divide-zinc-800/70 text-xs">
                  <div className="py-2 flex justify-between">
                    <span className="text-zinc-400">Total Orders Received</span>
                    <span className="font-bold text-white">
                      {op.totalOrdersReceived}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-zinc-400">Gross Original Order Value</span>
                    <span className="font-bold text-white">
                      ৳{Number(sp.grossOrderValue || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-zinc-400">Delivered Sales Value</span>
                    <span className="font-bold text-emerald-400">
                      ৳{Number(sp.deliveredGrossSalesValue || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-zinc-400">Net Sales After Returns</span>
                    <span className="font-bold text-indigo-300">
                      ৳{Number(sp.netSalesAfterReturns || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-zinc-400">Delivery Success Rate</span>
                    <span className="font-bold text-emerald-400">
                      {Number(dp?.deliverySuccessRate || 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 3: Return Performance & 3 Rate Formulas */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400">
                  Return Performance & Rates
                </h3>
                <div className="divide-y divide-zinc-800/70 text-xs">
                  <div className="py-2 flex justify-between">
                    <span className="text-zinc-400">
                      Full / Partial Returns
                    </span>
                    <span className="font-bold text-white">
                      {rp.fullReturnsCount} Full / {rp.partialReturnsCount}{" "}
                      Partial
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-zinc-400">
                      Total Returned Product Value
                    </span>
                    <span className="font-bold text-rose-400">
                      ৳{Number(rp.totalReturnedProductValue || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-zinc-400">Cash Refunds Issued</span>
                    <span className="font-bold text-amber-300">
                      ৳{Number(rp.totalRefundAmount || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-zinc-400">
                      Order Return Rate (vs Finalized)
                    </span>
                    <span className="font-bold text-rose-400">
                      {Number(rp.orderReturnRate || 0).toFixed(1)}% (
                      {Number(rp.finalizedOrderReturnRate || 0).toFixed(1)}%)
                    </span>
                  </div>
                  <div className="py-2 flex justify-between">
                    <span className="text-zinc-400">
                      Returned Value Percentage
                    </span>
                    <span className="font-bold text-amber-400">
                      {Number(rp.returnedValuePercentage || 0).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Month-over-Month Comparison Table */}
          {comparison && previousReport && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">
                  Period Comparison: {comprehensiveReport.period?.startDateBst}→
                  {comprehensiveReport.period?.endDateBst} vs{" "}
                  {previousReport.period?.startDateBst}→
                  {previousReport.period?.endDateBst}
                </h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
                {[
                  {
                    label: "Total Orders",
                    data: comparison.totalOrdersReceived,
                  },
                  {
                    label: "Gross Order Value",
                    data: comparison.grossOrderValue,
                    isCurrency: true,
                  },
                  {
                    label: "Delivered Sales",
                    data: comparison.deliveredSalesValue,
                    isCurrency: true,
                  },
                  {
                    label: "Net Sales",
                    data: comparison.netSalesAfterReturns,
                    isCurrency: true,
                  },
                  {
                    label: "Returned Value",
                    data: comparison.totalReturnedProductValue,
                    isCurrency: true,
                  },
                  {
                    label: "Return Rate %",
                    data: comparison.orderReturnRate,
                    isPercent: true,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-3"
                  >
                    <p className="text-[10px] text-zinc-500 uppercase">
                      {item.label}
                    </p>
                    <p className="text-sm font-bold text-white mt-1">
                      {item.isCurrency
                        ? `৳${Number(item.data?.current || 0).toLocaleString()}`
                        : item.isPercent
                        ? `${Number(item.data?.current || 0).toFixed(1)}%`
                        : item.data?.current}
                    </p>
                    <p
                      className={`text-[10px] font-semibold mt-1 ${
                        (item.data?.percentChange || 0) >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                      }`}
                    >
                      {(item.data?.percentChange || 0) >= 0 ? "+" : ""}
                      {Number(item.data?.percentChange || 0).toFixed(1)}% vs prev
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Revenue Chart & Pathao Courier Dispatches */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-7 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">
                      Revenue Trend
                    </h2>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Daily original order value over selected period (Asia/Dhaka)
                    </p>
                  </div>
                </div>
                <div className="h-72">
                  <RevenueChart data={revenueData} />
                </div>
              </div>
            </div>

            <div className="xl:col-span-5">
              <PathaoReconciliationWidget metrics={unifiedMetrics} />
            </div>
          </div>

          {/* Products Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Top Selling Products
                </h2>
                <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                  By qty sold
                </span>
              </div>
              {topProducts.length === 0 ? (
                <p className="text-center text-zinc-500 text-sm py-10">
                  No product data for this period.
                </p>
              ) : (
                <div className="space-y-3.5">
                  {topProducts.slice(0, 8).map((p: any, i: number) => (
                    <div key={p.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold text-zinc-600 w-5 shrink-0">
                            #{i + 1}
                          </span>
                          <p className="text-sm font-medium text-zinc-200 truncate">
                            {p.title}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 pl-3">
                          <span className="text-xs text-zinc-400">
                            {p.qty} sold
                          </span>
                          <span className="text-sm font-bold text-emerald-400">
                            ৳{Math.round(p.revenue).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full"
                          style={{ width: `${(p.qty / maxProdQty) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/60 p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Most Dispatched Products
                </h2>
                <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">
                  By dispatch volume
                </span>
              </div>
              {topDispatched.length === 0 ? (
                <p className="text-center text-zinc-500 text-sm py-10">
                  No dispatch data for this period.
                </p>
              ) : (
                <div className="space-y-3.5">
                  {topDispatched.slice(0, 8).map((p: any, i: number) => (
                    <div key={p.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold text-zinc-600 w-5 shrink-0">
                            #{i + 1}
                          </span>
                          <p className="text-sm font-medium text-zinc-200 truncate">
                            {p.title}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-sky-400 shrink-0 pl-3">
                          {p.qty} units
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full"
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
      )}

      {/* TAB 2: PRODUCT & SKU PERFORMANCE */}
      {activeTab === "products" && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setProductViewLevel("product")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold ${
                  productViewLevel === "product"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-950 text-zinc-400 border border-zinc-800"
                }`}
              >
                Product-Level ({comprehensiveReport?.productPerformance?.length || 0})
              </button>
              <button
                onClick={() => setProductViewLevel("sku")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold ${
                  productViewLevel === "sku"
                    ? "bg-indigo-600 text-white"
                    : "bg-zinc-950 text-zinc-400 border border-zinc-800"
                }`}
              >
                SKU & Variant-Level ({comprehensiveReport?.skuPerformance?.length || 0})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search product, SKU, variant..."
                  className="pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200"
                />
              </div>
              <select
                value={productSortBy}
                onChange={(e) => setProductSortBy(e.target.value as any)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200"
              >
                <option value="ordered">Sort by Ordered Units</option>
                <option value="delivered">Sort by Delivered Units</option>
                <option value="returned">Sort by Returned Units</option>
                <option value="return_rate">Sort by Unit Return %</option>
              </select>
              <a
                href={`/api/reports/comprehensive?format=csv&section=products&period=${filterType}&startDate=${startDate}&endDate=${endDate}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium"
              >
                <Download size={13} className="text-emerald-400" /> Export CSV
              </a>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400">
                    <th className="p-3">Product</th>
                    {productViewLevel === "sku" && (
                      <>
                        <th className="p-3">SKU</th>
                        <th className="p-3">Variant</th>
                      </>
                    )}
                    <th className="p-3 text-right">Ordered</th>
                    <th className="p-3 text-right">Dispatched</th>
                    <th className="p-3 text-right">Delivered</th>
                    <th className="p-3 text-right">Returned</th>
                    <th className="p-3 text-right">Delivered Sales</th>
                    <th className="p-3 text-right">Returned Value</th>
                    <th className="p-3 text-right">Net Sales</th>
                    <th className="p-3 text-right">Unit Return %</th>
                    <th className="p-3 text-right">Value Return %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {activeProductRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="p-8 text-center text-zinc-500">
                        No product performance records found.
                      </td>
                    </tr>
                  ) : (
                    activeProductRows.map((r: any, idx: number) => (
                      <tr key={idx} className="hover:bg-zinc-800/40">
                        <td className="p-3 font-semibold text-zinc-100 max-w-[220px] truncate">
                          {r.productTitle}
                        </td>
                        {productViewLevel === "sku" && (
                          <>
                            <td className="p-3 font-mono text-indigo-400">
                              {r.sku}
                            </td>
                            <td className="p-3 text-zinc-400">
                              {r.variantTitle}
                            </td>
                          </>
                        )}
                        <td className="p-3 text-right text-zinc-200">
                          {r.orderedQty}
                        </td>
                        <td className="p-3 text-right text-indigo-300">
                          {r.dispatchedQty}
                        </td>
                        <td className="p-3 text-right text-emerald-400 font-semibold">
                          {r.deliveredQty}
                        </td>
                        <td className="p-3 text-right text-rose-400 font-semibold">
                          {r.returnedQty}
                        </td>
                        <td className="p-3 text-right text-emerald-400">
                          ৳{Number(r.deliveredSalesValue || 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right text-rose-400">
                          ৳{Number(r.returnedProductValue || 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-bold text-white">
                          ৳{Number(r.netSalesValue || 0).toLocaleString()}
                        </td>
                        <td className="p-3 text-right font-semibold text-amber-400">
                          {Number(r.unitReturnRate || 0).toFixed(1)}%
                        </td>
                        <td className="p-3 text-right text-zinc-400">
                          {Number(r.valueReturnRate || 0).toFixed(1)}%
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: DAILY CLOSING STATEMENT */}
      {activeTab === "daily_closing" && (
        <div className="space-y-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-zinc-300">
                Select Closing Date (Asia/Dhaka):
              </label>
              <input
                type="date"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
              />
              {dailyData?.existingClosing && (
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Status: {dailyData.existingClosing.closing_status}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleGeneratePdf("daily_sales")}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold"
              >
                <FileText size={14} /> Daily Sales PDF
              </button>
              <button
                onClick={() => handleSaveDailyClosing("approved")}
                disabled={isSavingDaily}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold"
              >
                <CheckCircle2 size={14} /> Approve & Save Daily Closing
              </button>
              <button
                onClick={() => handleSaveDailyClosing("locked")}
                disabled={isSavingDaily}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold"
              >
                <Lock size={14} /> Lock Day
              </button>
            </div>
          </div>

          {isLoadingDaily ? (
            <div className="p-10 text-center text-zinc-500">
              Loading daily closing metrics...
            </div>
          ) : dailyData?.liveDailySummary ? (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                {
                  label: "Orders Received",
                  val: dailyData.liveDailySummary.ordersReceivedCount,
                },
                {
                  label: "Gross Order Value",
                  val: `৳${Number(dailyData.liveDailySummary.grossOrderValue || 0).toLocaleString()}`,
                },
                {
                  label: "Dispatched",
                  val: dailyData.liveDailySummary.ordersDispatchedCount,
                },
                {
                  label: "Delivered",
                  val: dailyData.liveDailySummary.ordersDeliveredCount,
                },
                {
                  label: "Net Sales Today",
                  val: `৳${Number(dailyData.liveDailySummary.netSalesToday || 0).toLocaleString()}`,
                },
                {
                  label: "Returned Value",
                  val: `৳${Number(dailyData.liveDailySummary.returnedProductValue || 0).toLocaleString()}`,
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="bg-zinc-900 border border-zinc-800 rounded-2xl p-3.5"
                >
                  <p className="text-[10px] text-zinc-500 uppercase">
                    {m.label}
                  </p>
                  <p className="text-base font-bold text-white mt-1">{m.val}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Daily Closing Notes / Handover Remarks
            </label>
            <textarea
              rows={2}
              value={dailyNotes}
              onChange={(e) => setDailyNotes(e.target.value)}
              placeholder="Record any cash handover notes, courier pickup issues, or daily summary remarks..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200"
            />
          </div>
        </div>
      )}

      {/* TAB 4: MONTH-END CLOSING SYSTEM */}
      {activeTab === "monthly_closing" && (
        <div className="space-y-5 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold text-zinc-300">
                Closing Period:
              </label>
              <select
                value={closingMonth}
                onChange={(e) => setClosingMonth(Number(e.target.value))}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2026, m - 1, 1).toLocaleString("en-US", {
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
              <select
                value={closingYear}
                onChange={(e) => setClosingYear(Number(e.target.value))}
                className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-100"
              >
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              {monthlyData?.existingClosing && (
                <span
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase ${
                    monthlyData.existingClosing.closing_status === "locked"
                      ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  }`}
                >
                  {monthlyData.existingClosing.closing_status}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {monthlyData?.existingClosing?.closing_status !== "locked" ? (
                <>
                  <button
                    onClick={() =>
                      handleMonthlyClosingAction("save_or_lock", "approved")
                    }
                    disabled={isSavingMonthly}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold"
                  >
                    <CheckCircle2 size={14} /> Approve Monthly Statement
                  </button>
                  <button
                    onClick={() =>
                      handleMonthlyClosingAction("save_or_lock", "locked")
                    }
                    disabled={isSavingMonthly}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-semibold"
                  >
                    <Lock size={14} /> Lock Month-End Snapshot
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Reason to reopen locked month..."
                    className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-200"
                  />
                  <button
                    onClick={() => handleMonthlyClosingAction("reopen")}
                    disabled={isSavingMonthly || !reopenReason.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                  >
                    <Unlock size={13} /> Reopen (Admin)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Pre-Closing Validation Checklist */}
          {monthlyData?.validationSummary?.checklist && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Pre-Closing Operational Validation Checklist (
                {monthlyData.periodKey})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {monthlyData.validationSummary.checklist.map((c: any) => (
                  <div
                    key={c.id}
                    className={`p-3 rounded-xl border ${
                      c.passed
                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
                        : "bg-amber-500/10 border-amber-500/25 text-amber-300"
                    }`}
                  >
                    <p className="text-[11px] font-semibold">{c.label}</p>
                    <p className="text-base font-bold mt-1">
                      {c.passed ? "✓ Passed" : `⚠️ ${c.warningCount} Pending`}
                    </p>
                    <p className="text-[10px] opacity-80 mt-1">{c.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: EXPORT CENTER (BRANDED PDFS & UTF-8 BOM CSVS) */}
      {activeTab === "exports" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
          {/* Branded Universes RAW PDF Reports */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Branded {companyName || "Universes RAW"} PDF Reports
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Executive cover header, KPI cards, reconciled tables, and
                signature blocks ({startDate} → {endDate})
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(
                [
                  { id: "daily_sales", label: "1. Daily Sales & Dispatch PDF" },
                  { id: "monthly_sales", label: "2. Monthly Sales Report PDF" },
                  {
                    id: "monthly_returns",
                    label: "3. Monthly Returns & Rates PDF",
                  },
                  {
                    id: "delivery_performance",
                    label: "4. Delivery Performance PDF",
                  },
                  {
                    id: "complete_monthly_report",
                    label: "5. Complete Monthly Pack PDF",
                  },
                ] as { id: PdfReportType; label: string }[]
              ).map((pdf) => (
                <button
                  key={pdf.id}
                  onClick={() => handleGeneratePdf(pdf.id)}
                  className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 text-xs font-semibold text-zinc-200 transition-colors"
                >
                  <span>{pdf.label}</span>
                  <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* UTF-8 BOM CSV Exports */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Excel-Compatible CSV Exports (UTF-8 BOM)
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Consistent column headers, Asia/Dhaka timestamps, and non-destructive
                order totals
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { id: "orders", label: "1. Orders Master CSV" },
                { id: "dispatches", label: "2. Dispatches & Consignments CSV" },
                { id: "deliveries", label: "3. Delivered Orders CSV" },
                { id: "returns", label: "4. Returns & Deductions CSV" },
                { id: "products", label: "5. Product & SKU Performance CSV" },
                { id: "monthly_summary", label: "6. Executive Summary CSV" },
              ].map((csv) => (
                <a
                  key={csv.id}
                  href={`/api/reports/comprehensive?format=csv&section=${csv.id}&period=${filterType}&startDate=${startDate}&endDate=${endDate}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 hover:bg-zinc-800/80 border border-zinc-800 text-xs font-semibold text-zinc-200 transition-colors"
                >
                  <span>{csv.label}</span>
                  <Download className="w-4 h-4 text-emerald-400 shrink-0" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
