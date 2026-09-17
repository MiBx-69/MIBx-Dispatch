"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Truck, CheckCircle2, ArrowDownLeft, RotateCcw, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { UnifiedReportMetrics } from "@/lib/reporting-engine";

interface Props {
  metrics: UnifiedReportMetrics;
}

export function PathaoReconciliationWidget({ metrics }: Props) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const hasAutoSynced = useRef(false);

  const {
    courierDeliveredCount = 0,
    courierDeliveredValue = 0,
    courierPaidReturnCount = 0,
    courierPaidReturnValue = 0,
    courierPaidReturnFee = 0,
    courierReturnedCount = 0,
    courierReturnedValue = 0,
    courierProcessingCount = 0,
    courierProcessingValue = 0,
    courierPickupIssueCount = 0,
    courierActiveTotalCount = 0,
    courierActiveTotalValue = 0,
    dateFilter,
    startDateStr,
    endDateStr,
  } = metrics;

  const handleManualSync = async (silent = false) => {
    if (isSyncing) return;
    setIsSyncing(true);
    let toastId;
    if (!silent) {
      toastId = toast.loading("Syncing active pending parcels with Pathao...");
    }
    try {
      const res = await fetch("/api/pathao/sync-status", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync with Pathao");

      if (!silent) {
        toast.success("Pathao Sync Completed!", {
          id: toastId,
          description: `Checked ${data.checked || data.totalChecked || 0} active parcels in ${data.durationMs ? (data.durationMs / 1000).toFixed(1) + 's' : 'seconds'}. Updated ${data.updated || data.updatedCount || 0} statuses.`,
        });
      }
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (data.updatedCount > 0) {
        router.refresh();
      }
    } catch (err: any) {
      if (!silent && toastId) toast.error(err.message || "Sync failed", { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!hasAutoSynced.current) {
      hasAutoSynced.current = true;
      handleManualSync(true);
    }
  }, []);

  // Sync is exclusively manual on-click, via background webhooks, or auto on mount

  // Calculate percentages based on active orders (Delivered + Paid Return + Returned + Processing)
  const totalOrders = courierActiveTotalCount || 1;
  const deliveredPct = ((courierDeliveredCount / totalOrders) * 100).toFixed(2);
  const paidReturnPct = ((courierPaidReturnCount / totalOrders) * 100).toFixed(2);
  const returnedPct = ((courierReturnedCount / totalOrders) * 100).toFixed(2);
  const processingPct = ((courierProcessingCount / totalOrders) * 100).toFixed(2);

  // Calculate SVG Donut stroke offsets
  const radius = 64;
  const circumference = 2 * Math.PI * radius; // ~402.12
  const deliveredLength = (courierDeliveredCount / totalOrders) * circumference;
  const paidReturnLength = (courierPaidReturnCount / totalOrders) * circumference;
  const returnedLength = (courierReturnedCount / totalOrders) * circumference;
  const processingLength = (courierProcessingCount / totalOrders) * circumference;

  const deliveredOffset = 0;
  const paidReturnOffset = -deliveredLength;
  const returnedOffset = -(deliveredLength + paidReturnLength);
  const processingOffset = -(deliveredLength + paidReturnLength + returnedLength);

  // Format date range for header display
  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const dateLabel = startDateStr && endDateStr 
    ? `${formatDate(startDateStr)} - ${formatDate(endDateStr)}`
    : dateFilter?.replace(/_/g, " ").toUpperCase() || "THIS MONTH";

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/90 shadow-xl overflow-hidden backdrop-blur-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-zinc-800/60 bg-zinc-900/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 font-bold text-base shadow-inner">
            P
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-zinc-100">Pathao Courier Statistics</h2>
              {isSyncing ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <RefreshCw size={10} className="animate-spin text-amber-400" />
                  Syncing with Pathao...
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {lastSyncTime ? `Synced at ${lastSyncTime}` : "Active"}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5">
              <span>📅 {dateLabel}</span>
              <span className="text-zinc-600">•</span>
              <span>Real-time Webhook & On-demand Sync</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Manual Sync Button */}
          <button
            type="button"
            onClick={() => handleManualSync(false)}
            disabled={isSyncing}
            className="text-xs font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            title="Sync active pending parcels with Pathao"
          >
            <RefreshCw size={13} className={isSyncing ? "animate-spin text-amber-400" : "text-amber-400"} />
            <span>{isSyncing ? "Syncing..." : "Sync Pending"}</span>
          </button>

          <Link
            href="/dispatches"
            className="text-xs text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Truck size={13} className="text-zinc-400" />
            <span className="hidden sm:inline">View All Dispatches</span>
          </Link>
        </div>
      </div>

      {/* Main Content: Donut + 4 Metrics */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Donut Chart */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center relative">
            <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
                {/* Background Ring */}
                <circle
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="none"
                  stroke="#27272a"
                  strokeWidth="16"
                />

                {/* Delivered (Emerald) */}
                {deliveredLength > 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="16"
                    strokeDasharray={`${deliveredLength} ${circumference}`}
                    strokeDashoffset={deliveredOffset}
                    strokeLinecap="butt"
                    className="transition-all duration-700"
                  />
                )}

                {/* Paid Return (Blue) */}
                {paidReturnLength > 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="16"
                    strokeDasharray={`${paidReturnLength} ${circumference}`}
                    strokeDashoffset={paidReturnOffset}
                    strokeLinecap="butt"
                    className="transition-all duration-700"
                  />
                )}

                {/* Returned (Rose/Red) */}
                {returnedLength > 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="16"
                    strokeDasharray={`${returnedLength} ${circumference}`}
                    strokeDashoffset={returnedOffset}
                    strokeLinecap="butt"
                    className="transition-all duration-700"
                  />
                )}

                {/* Delivery Processing (Amber/Orange) */}
                {processingLength > 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="16"
                    strokeDasharray={`${processingLength} ${circumference}`}
                    strokeDashoffset={processingOffset}
                    strokeLinecap="butt"
                    className="transition-all duration-700"
                  />
                )}
              </svg>

              {/* Center Total Content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4">
                <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
                  Total Value
                </span>
                <span className="text-xl sm:text-2xl font-extrabold text-white mt-1 tracking-tight">
                  ৳ {courierActiveTotalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
                <span className="text-xs font-medium text-zinc-400 mt-0.5">
                  {courierActiveTotalCount} Orders
                </span>
              </div>
            </div>

            {courierPickupIssueCount > 0 && (
              <p className="text-[11px] text-zinc-500 mt-3 text-center">
                + {courierPickupIssueCount} orders under pickup review / hold
              </p>
            )}
          </div>

          {/* 4 Status Breakdown Columns */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Delivered */}
            <div className="rounded-xl p-4 bg-emerald-500/5 border-l-4 border-emerald-500 border-y border-r border-zinc-800/80 hover:bg-emerald-500/10 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  Delivered
                </span>
                <span className="text-xs font-bold text-emerald-400">{deliveredPct}%</span>
              </div>
              <div className="mt-2.5">
                <p className="text-2xl font-extrabold text-white tracking-tight">
                  {deliveredPct}%
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  <span className="text-zinc-200 font-semibold">{courierDeliveredCount} orders</span>{" "}
                  <span className="text-zinc-500">|</span>{" "}
                  <span className="text-emerald-400 font-medium">৳ {courierDeliveredValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                </p>
              </div>
            </div>

            {/* 2. Paid Return */}
            <div className="rounded-xl p-4 bg-blue-500/5 border-l-4 border-blue-500 border-y border-r border-zinc-800/80 hover:bg-blue-500/10 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <ArrowDownLeft size={13} className="text-blue-400" />
                  Paid Return
                </span>
                <span className="text-xs font-bold text-blue-400">{paidReturnPct}%</span>
              </div>
              <div className="mt-2.5">
                <p className="text-2xl font-extrabold text-white tracking-tight">
                  {paidReturnPct}%
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  <span className="text-zinc-200 font-semibold">{courierPaidReturnCount} orders</span>{" "}
                  <span className="text-zinc-500">|</span>{" "}
                  <span className="text-blue-400 font-medium">৳ {courierPaidReturnValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                </p>
                {courierPaidReturnFee > 0 && (
                  <p className="text-[10px] text-blue-400/70 mt-0.5">
                    (৳ {courierPaidReturnFee.toLocaleString('en-IN', { maximumFractionDigits: 0 })} return fee collected)
                  </p>
                )}
              </div>
            </div>

            {/* 3. Returned */}
            <div className="rounded-xl p-4 bg-rose-500/5 border-l-4 border-rose-500 border-y border-r border-zinc-800/80 hover:bg-rose-500/10 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <RotateCcw size={13} className="text-rose-400" />
                  Returned
                </span>
                <span className="text-xs font-bold text-rose-400">{returnedPct}%</span>
              </div>
              <div className="mt-2.5">
                <p className="text-2xl font-extrabold text-white tracking-tight">
                  {returnedPct}%
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  <span className="text-zinc-200 font-semibold">{courierReturnedCount} orders</span>{" "}
                  <span className="text-zinc-500">|</span>{" "}
                  <span className="text-rose-400 font-medium">৳ {courierReturnedValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                </p>
              </div>
            </div>

            {/* 4. Delivery Processing */}
            <div className="rounded-xl p-4 bg-amber-500/5 border-l-4 border-amber-500 border-y border-r border-zinc-800/80 hover:bg-amber-500/10 transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Clock size={13} className="text-amber-400" />
                  Delivery Processing
                </span>
                <span className="text-xs font-bold text-amber-400">{processingPct}%</span>
              </div>
              <div className="mt-2.5">
                <p className="text-2xl font-extrabold text-white tracking-tight">
                  {processingPct}%
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  <span className="text-zinc-200 font-semibold">{courierProcessingCount} orders</span>{" "}
                  <span className="text-zinc-500">|</span>{" "}
                  <span className="text-amber-400 font-medium">৳ {courierProcessingValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
