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
    let toastId: string | number | undefined;
    if (!silent) {
      toastId = toast.loading("Syncing active pending parcels with Pathao...");
    }
    try {
      const res = await fetch("/api/pathao/sync-status", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync with Pathao");
      if (!silent) {
        toast.success("Pathao Sync Completed!", {
          id: toastId,
          description: `Checked ${data.checked || data.totalChecked || 0} parcels in ${data.durationMs ? (data.durationMs / 1000).toFixed(1) + "s" : "seconds"}. Updated ${data.updated || data.updatedCount || 0} statuses.`,
        });
      }
      setLastSyncTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (data.updatedCount > 0) router.refresh();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Percentages
  const totalOrders = courierActiveTotalCount || 1;
  const deliveredPct = ((courierDeliveredCount / totalOrders) * 100).toFixed(1);
  const paidReturnPct = ((courierPaidReturnCount / totalOrders) * 100).toFixed(1);
  const returnedPct = ((courierReturnedCount / totalOrders) * 100).toFixed(1);
  const processingPct = ((courierProcessingCount / totalOrders) * 100).toFixed(1);

  // SVG donut
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const deliveredLength = (courierDeliveredCount / totalOrders) * circumference;
  const paidReturnLength = (courierPaidReturnCount / totalOrders) * circumference;
  const returnedLength = (courierReturnedCount / totalOrders) * circumference;
  const processingLength = (courierProcessingCount / totalOrders) * circumference;
  const deliveredOffset = 0;
  const paidReturnOffset = -deliveredLength;
  const returnedOffset = -(deliveredLength + paidReturnLength);
  const processingOffset = -(deliveredLength + paidReturnLength + returnedLength);

  // Date label
  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  };
  const dateLabel =
    startDateStr && endDateStr
      ? `${formatDate(startDateStr)} – ${formatDate(endDateStr)}`
      : dateFilter?.replace(/_/g, " ").toUpperCase() || "THIS MONTH";

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/80 shadow-xl overflow-hidden h-full flex flex-col">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/40 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 font-bold text-sm shrink-0">
            P
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-zinc-100 whitespace-nowrap">Pathao Courier</h2>
              {isSyncing ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
                  <RefreshCw size={9} className="animate-spin" />
                  Syncing…
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  {lastSyncTime ? `Synced ${lastSyncTime}` : "Active"}
                </span>
              )}
            </div>
            <p className="text-[10px] text-zinc-500 truncate">📅 {dateLabel}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => handleManualSync(false)}
            disabled={isSyncing}
            className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{isSyncing ? "Syncing…" : "Sync"}</span>
          </button>
          <Link
            href="/dispatches"
            className="text-[11px] text-zinc-300 hover:text-white bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/60 px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1"
          >
            <Truck size={11} className="text-zinc-400" />
            <span className="hidden sm:inline">Dispatches</span>
          </Link>
        </div>
      </div>

      {/* ── Body: donut + 2×2 stats ── */}
      <div className="p-4 flex-1 flex flex-col gap-4">

        {/* Donut — compact, centred */}
        <div className="flex flex-col items-center">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r={radius} fill="none" stroke="#27272a" strokeWidth="14" />
              {deliveredLength > 0 && (
                <circle cx="80" cy="80" r={radius} fill="none" stroke="#10b981" strokeWidth="14"
                  strokeDasharray={`${deliveredLength} ${circumference}`}
                  strokeDashoffset={deliveredOffset} strokeLinecap="butt"
                  className="transition-all duration-700" />
              )}
              {paidReturnLength > 0 && (
                <circle cx="80" cy="80" r={radius} fill="none" stroke="#3b82f6" strokeWidth="14"
                  strokeDasharray={`${paidReturnLength} ${circumference}`}
                  strokeDashoffset={paidReturnOffset} strokeLinecap="butt"
                  className="transition-all duration-700" />
              )}
              {returnedLength > 0 && (
                <circle cx="80" cy="80" r={radius} fill="none" stroke="#ef4444" strokeWidth="14"
                  strokeDasharray={`${returnedLength} ${circumference}`}
                  strokeDashoffset={returnedOffset} strokeLinecap="butt"
                  className="transition-all duration-700" />
              )}
              {processingLength > 0 && (
                <circle cx="80" cy="80" r={radius} fill="none" stroke="#f97316" strokeWidth="14"
                  strokeDasharray={`${processingLength} ${circumference}`}
                  strokeDashoffset={processingOffset} strokeLinecap="butt"
                  className="transition-all duration-700" />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] font-semibold text-zinc-400 uppercase tracking-widest">Total</span>
              <span className="text-sm font-extrabold text-white mt-0.5 leading-none">
                ৳{(courierActiveTotalValue / 1000).toFixed(0)}k
              </span>
              <span className="text-[10px] text-zinc-400 mt-0.5">{courierActiveTotalCount} orders</span>
            </div>
          </div>
          {courierPickupIssueCount > 0 && (
            <p className="text-[10px] text-zinc-500 mt-1 text-center">
              +{courierPickupIssueCount} under pickup review
            </p>
          )}
        </div>

        {/* 2×2 stat cards */}
        <div className="grid grid-cols-2 gap-2 flex-1">
          {/* Delivered */}
          <div className="rounded-xl p-3 bg-emerald-500/5 border border-emerald-500/20 hover:bg-emerald-500/10 transition-colors">
            <div className="flex items-center gap-1.5 mb-1.5">
              <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
              <span className="text-[10px] font-semibold text-zinc-300">Delivered</span>
            </div>
            <p className="text-base font-extrabold text-emerald-400 leading-none">{deliveredPct}%</p>
            <p className="text-[10px] text-zinc-400 mt-1">
              <span className="text-zinc-200 font-semibold">{courierDeliveredCount}</span> orders
            </p>
            <p className="text-[10px] text-emerald-400 font-medium mt-0.5 truncate">
              ৳{courierDeliveredValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
          </div>

          {/* Paid Return */}
          <div className="rounded-xl p-3 bg-blue-500/5 border border-blue-500/20 hover:bg-blue-500/10 transition-colors">
            <div className="flex items-center gap-1.5 mb-1.5">
              <ArrowDownLeft size={11} className="text-blue-400 shrink-0" />
              <span className="text-[10px] font-semibold text-zinc-300">Paid Return</span>
            </div>
            <p className="text-base font-extrabold text-blue-400 leading-none">{paidReturnPct}%</p>
            <p className="text-[10px] text-zinc-400 mt-1">
              <span className="text-zinc-200 font-semibold">{courierPaidReturnCount}</span> orders
            </p>
            <p className="text-[10px] text-blue-400 font-medium mt-0.5 truncate">
              ৳{courierPaidReturnValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
            {courierPaidReturnFee > 0 && (
              <p className="text-[9px] text-blue-400/60 mt-0.5 truncate">
                fee: ৳{courierPaidReturnFee.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </p>
            )}
          </div>

          {/* Returned */}
          <div className="rounded-xl p-3 bg-rose-500/5 border border-rose-500/20 hover:bg-rose-500/10 transition-colors">
            <div className="flex items-center gap-1.5 mb-1.5">
              <RotateCcw size={11} className="text-rose-400 shrink-0" />
              <span className="text-[10px] font-semibold text-zinc-300">Returned</span>
            </div>
            <p className="text-base font-extrabold text-rose-400 leading-none">{returnedPct}%</p>
            <p className="text-[10px] text-zinc-400 mt-1">
              <span className="text-zinc-200 font-semibold">{courierReturnedCount}</span> orders
            </p>
            <p className="text-[10px] text-rose-400 font-medium mt-0.5 truncate">
              ৳{courierReturnedValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
          </div>

          {/* Processing */}
          <div className="rounded-xl p-3 bg-amber-500/5 border border-amber-500/20 hover:bg-amber-500/10 transition-colors">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Clock size={11} className="text-amber-400 shrink-0" />
              <span className="text-[10px] font-semibold text-zinc-300">Processing</span>
            </div>
            <p className="text-base font-extrabold text-amber-400 leading-none">{processingPct}%</p>
            <p className="text-[10px] text-zinc-400 mt-1">
              <span className="text-zinc-200 font-semibold">{courierProcessingCount}</span> orders
            </p>
            <p className="text-[10px] text-amber-400 font-medium mt-0.5 truncate">
              ৳{courierProcessingValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
