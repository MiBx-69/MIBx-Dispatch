"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Truck,
  RotateCcw,
  XCircle,
  Clock,
  AlertTriangle,
  Package,
  Search,
  Download,
  FileText,
  ExternalLink,
  Timer,
  TrendingUp,
} from "lucide-react";
import type { BusinessMetricsReport } from "@/lib/business-metrics-engine";
import { generateBrandedBusinessPdf } from "@/lib/pdf-report-generator";
import { formatBstDate } from "@/lib/date-utils";

interface DeliveredOrderRow {
  id: string;
  shopify_order_name: string;
  customer_name: string;
  customer_phone: string;
  consignment_id: string;
  delivery_status: string;
  shopify_created_at: string;
  delivered_at: string;
  original_total: number;
  partial_return_deduction: number;
  net_delivered_value: number;
}

export function DeliveriesClient({
  report,
  deliveredOrders,
  dateFilter,
  customFrom,
  customTo,
  initialSearch,
}: {
  report: BusinessMetricsReport;
  deliveredOrders: DeliveredOrderRow[];
  dateFilter: string;
  customFrom: string;
  customTo: string;
  initialSearch: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [fromDate, setFromDate] = useState(customFrom || report.period.startDateBst);
  const [toDate, setToDate] = useState(customTo || report.period.endDateBst);
  const [typeFilter, setTypeFilter] = useState<"all" | "full" | "partial">("all");

  const op = report.orderPerformance;
  const dp = report.deliveryPerformance;
  const sp = report.salesPerformance;

  const handlePresetChange = (preset: string) => {
    router.push(`/deliveries?dateFilter=${preset}`);
  };

  const handleApplyCustom = () => {
    if (fromDate && toDate) {
      router.push(`/deliveries?dateFilter=custom&from=${fromDate}&to=${toDate}`);
    }
  };

  const filteredDelivered = useMemo(() => {
    return deliveredOrders.filter((o) => {
      if (typeFilter === "partial" && o.partial_return_deduction <= 0 && !o.delivery_status.toLowerCase().includes("partial")) {
        return false;
      }
      if (typeFilter === "full" && (o.partial_return_deduction > 0 || o.delivery_status.toLowerCase().includes("partial"))) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        o.shopify_order_name.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.customer_phone.toLowerCase().includes(q) ||
        o.consignment_id.toLowerCase().includes(q)
      );
    });
  }, [deliveredOrders, search, typeFilter]);

  const statusCounts = [
    { label: "Total Received", value: op.totalOrdersReceived, color: "text-sky-400", bg: "bg-sky-500/10 border-sky-500/20" },
    { label: "Verified", value: op.verifiedOrdersCount, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20" },
    { label: "Dispatched", value: op.dispatchedOrdersCount, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
    { label: "In-Transit", value: op.inTransitOrdersCount, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
    { label: "Delivered", value: op.deliveredOrdersCount, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    { label: "Partial Delivered", value: op.partiallyDeliveredOrdersCount, color: "text-teal-400", bg: "bg-teal-500/10 border-teal-500/20" },
    { label: "Fully Returned", value: op.fullyReturnedOrdersCount, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
    { label: "Cancelled", value: op.cancelledOrdersCount, color: "text-zinc-400", bg: "bg-zinc-500/10 border-zinc-500/20" },
    { label: "Failed / Hold", value: op.failedDeliveriesCount, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
    { label: "Pending Dispatch", value: op.pendingOrdersCount + op.preparingOrdersCount, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  ];

  const performanceRates = [
    {
      label: "Delivery Success Rate",
      value: `${dp.deliverySuccessRate}%`,
      formula: `${op.deliveredOrdersCount} delivered / ${op.finalizedEligibleOrdersCount} finalized orders`,
      icon: CheckCircle2,
      color: "text-emerald-400",
    },
    {
      label: "Finalized Return Rate",
      value: `${dp.returnRate}%`,
      formula: `${report.returnPerformance.ordersWithAnyReturnCount} returned (full+partial) / ${op.finalizedEligibleOrdersCount} finalized`,
      icon: RotateCcw,
      color: "text-rose-400",
    },
    {
      label: "Cancellation Rate",
      value: `${dp.cancellationRate}%`,
      formula: `${op.cancelledOrdersCount} cancelled / ${op.totalOrdersReceived} total received`,
      icon: XCircle,
      color: "text-zinc-300",
    },
    {
      label: "Failed Delivery Rate",
      value: `${dp.failedDeliveryRate}%`,
      formula: `${op.failedDeliveriesCount} failed or returned / ${op.eligibleDispatchedOrdersCount} dispatched`,
      icon: AlertTriangle,
      color: "text-amber-400",
    },
    {
      label: "Avg. Delivery Time",
      value: `${dp.averageDeliveryTimeDays} days`,
      formula: `${dp.averageDeliveryTimeHours} hours avg (Dispatched → Delivered)`,
      icon: Timer,
      color: "text-cyan-400",
    },
    {
      label: "Avg. Return Processing",
      value: `${dp.averageReturnProcessingTimeDays} days`,
      formula: `${dp.averageReturnProcessingTimeHours} hours avg (Returned → Processed)`,
      icon: Clock,
      color: "text-violet-400",
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-100">
                Delivery Tracking & Performance Analytics
              </h1>
              <p className="text-xs text-zinc-400">
                Period (Asia/Dhaka): {report.period.startDateBst} to {report.period.endDateBst}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: "today", label: "Today" },
            { key: "yesterday", label: "Yesterday" },
            { key: "this_week", label: "This Week" },
            { key: "last_7_days", label: "7 Days" },
            { key: "this_month", label: "This Month" },
            { key: "last_month", label: "Last Month" },
            { key: "all", label: "All Time" },
          ].map((p) => (
            <button
              key={p.key}
              onClick={() => handlePresetChange(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                dateFilter === p.key
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {p.label}
            </button>
          ))}

          <div className="flex items-center gap-1.5 bg-zinc-950/70 border border-zinc-800 rounded-lg px-2 py-1">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="bg-transparent text-xs text-zinc-300 focus:outline-none"
            />
            <span className="text-zinc-600 text-xs">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="bg-transparent text-xs text-zinc-300 focus:outline-none"
            />
            <button
              onClick={handleApplyCustom}
              className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium"
            >
              Go
            </button>
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-xs text-zinc-400 mr-2">Delivered Gross Sales:</span>
            <span className="text-sm font-bold text-emerald-400">
              ৳{sp.deliveredGrossSalesValue.toLocaleString()}
            </span>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-teal-500/10 border border-teal-500/20">
            <span className="text-xs text-zinc-400 mr-2">Net Delivered Sales (After Partial Returns):</span>
            <span className="text-sm font-bold text-teal-400">
              ৳{sp.netSalesAfterReturns.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              generateBrandedBusinessPdf({
                reportType: "delivery_performance",
                report,
              })
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Export Delivery PDF
          </button>
          <a
            href={`/api/deliveries/export?dateFilter=${dateFilter}&startDate=${fromDate}&endDate=${toDate}`}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export Delivered CSV
          </a>
          <Link
            href="/orders?status=delivered"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-zinc-700/80 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Bulk Manage in Orders
          </Link>
        </div>
      </div>

      {/* 10 Lifecycle Status Counts */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
          Order & Delivery Lifecycle Counts (10 Stages)
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {statusCounts.map((item) => (
            <div
              key={item.label}
              className={`rounded-xl border p-3.5 ${item.bg}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                {item.label}
              </p>
              <p className={`text-2xl font-extrabold mt-1.5 ${item.color}`}>
                {item.value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 6 Performance Rates & Times */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
          Standardized Delivery Performance Rates & Processing Times
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {performanceRates.map((rate) => (
            <div
              key={rate.label}
              className="rounded-2xl border border-zinc-800/80 bg-zinc-900/70 p-4 flex items-start gap-3.5"
            >
              <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                <rate.icon className={`w-4 h-4 ${rate.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-zinc-300">{rate.label}</p>
                <p className={`text-xl font-bold mt-1 ${rate.color}`}>{rate.value}</p>
                <p className="text-[11px] text-zinc-500 mt-1">{rate.formula}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Delivered Orders Ledger Table */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/80 overflow-hidden">
        <div className="p-4 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-100">
              Delivered Orders Ledger ({filteredDelivered.length})
            </h2>
            <p className="text-xs text-zinc-500">
              Non-destructive original order totals with verified partial return deductions
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "full", "partial"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                  typeFilter === t
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {t === "all" ? "All Delivered" : t === "full" ? "Full Delivered" : "Partial Delivered"}
              </button>
            ))}

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order, phone, consignment..."
                className="pl-8 pr-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-emerald-500 w-60"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/80 text-[11px] uppercase tracking-wider text-zinc-400 bg-zinc-950/40">
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Consignment ID</th>
                <th className="py-3 px-4">Order Date (BST)</th>
                <th className="py-3 px-4">Delivered Date (BST)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Original Total</th>
                <th className="py-3 px-4 text-right">Partial Deduction</th>
                <th className="py-3 px-4 text-right">Net Delivered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-xs">
              {filteredDelivered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-zinc-500">
                    No delivered orders match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredDelivered.slice(0, 200).map((o) => {
                  const isPartial =
                    o.partial_return_deduction > 0 ||
                    o.delivery_status.toLowerCase().includes("partial");
                  return (
                    <tr key={o.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4 font-bold text-zinc-100">
                        <Link
                          href={`/orders?status=delivered&search=${encodeURIComponent(o.shopify_order_name)}`}
                          className="hover:text-emerald-400 underline-offset-2 hover:underline"
                        >
                          {o.shopify_order_name}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-zinc-200">{o.customer_name}</div>
                        <div className="text-[11px] text-zinc-500">{o.customer_phone}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-300">
                        {o.consignment_id || "—"}
                      </td>
                      <td className="py-3 px-4 text-zinc-400">
                        {formatBstDate(o.shopify_created_at)}
                      </td>
                      <td className="py-3 px-4 text-zinc-300">
                        {o.delivered_at ? formatBstDate(o.delivered_at) : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            isPartial
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                          }`}
                        >
                          {isPartial ? "Partial Delivered" : "Delivered"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-zinc-300">
                        ৳{o.original_total.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-rose-400">
                        {o.partial_return_deduction > 0
                          ? `-৳${o.partial_return_deduction.toLocaleString()}`
                          : "—"}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-400">
                        ৳{o.net_delivered_value.toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

