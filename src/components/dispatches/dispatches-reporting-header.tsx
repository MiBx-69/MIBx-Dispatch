"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Truck,
  TrendingUp,
  PackageCheck,
  RotateCcw,
  Calendar,
  Download,
  UploadCloud,
  Filter,
  CheckCircle2,
} from "lucide-react";

export interface DispatchStats {
  totalQuantity: number;
  totalAmount: number;
  deliveredCount: number;
  deliveredAmount: number;
  returnedCount: number;
  returnedAmount: number;
  dateFilter: string;
  startDate?: string;
  endDate?: string;
}

interface DispatchesReportingHeaderProps {
  stats: DispatchStats | null;
  onOpenImportModal: () => void;
}

const DATE_PRESETS = [
  { id: "all", label: "All Time" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7_days", label: "Last 7 Days" },
  { id: "last_30_days", label: "Last 30 Days" },
  { id: "this_month", label: "This Month" },
  { id: "last_month", label: "Last Month" },
  { id: "custom", label: "Custom Range" },
];

export function DispatchesReportingHeader({
  stats,
  onOpenImportModal,
}: DispatchesReportingHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const activeDateFilter = searchParams.get("dateFilter") || stats?.dateFilter || "all";
  const [customStart, setCustomStart] = useState(
    searchParams.get("startDate") || stats?.startDate || ""
  );
  const [customEnd, setCustomEnd] = useState(
    searchParams.get("endDate") || stats?.endDate || ""
  );
  const [showCustomInputs, setShowCustomInputs] = useState(activeDateFilter === "custom");

  const setFilter = (preset: string) => {
    if (preset === "custom") {
      setShowCustomInputs(true);
      return;
    }
    setShowCustomInputs(false);

    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      if (preset === "all") {
        params.delete("dateFilter");
      } else {
        params.set("dateFilter", preset);
      }
      params.delete("startDate");
      params.delete("endDate");
      params.delete("page");
      router.push(`/dispatches?${params.toString()}`);
    });
  };

  const applyCustomDates = () => {
    if (!customStart || !customEnd) return;
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("dateFilter", "custom");
      params.set("startDate", customStart);
      params.set("endDate", customEnd);
      params.delete("page");
      router.push(`/dispatches?${params.toString()}`);
    });
  };

  const handleExport = () => {
    const params = new URLSearchParams(window.location.search);
    window.open(`/api/dispatches/export?${params.toString()}`, "_blank");
  };

  const activeLabel = DATE_PRESETS.find((p) => p.id === activeDateFilter)?.label || "All Time";

  const totalQuantity = stats?.totalQuantity ?? 0;
  const totalAmount = stats?.totalAmount ?? 0;
  const deliveredCount = stats?.deliveredCount ?? 0;
  const deliveredAmount = stats?.deliveredAmount ?? 0;
  const returnedCount = stats?.returnedCount ?? 0;
  const returnedAmount = stats?.returnedAmount ?? 0;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-2.5 sm:p-3 space-y-2 mb-1">
      {/* Top row: Slim Title, Period Tag, and Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
            <Truck size={13} />
          </div>
          <span className="text-xs sm:text-sm font-medium text-zinc-200">
            Dispatches Report
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium flex items-center gap-1">
            <CheckCircle2 size={10} /> {activeLabel}
          </span>
        </div>

        {/* Small Action Buttons */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={handleExport}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-300 bg-zinc-800/80 hover:bg-zinc-700 hover:text-white border border-zinc-700/80 transition-colors"
            title="Export Current Dispatches as CSV"
          >
            <Download size={11} className="text-zinc-400" />
            <span>Export</span>
          </button>

          <button
            onClick={onOpenImportModal}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-emerald-300 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/25 transition-colors"
          >
            <UploadCloud size={11} className="text-emerald-400" />
            <span>Import</span>
          </button>
        </div>
      </div>

      {/* 4 Small Stat Pills */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 sm:gap-2">
        {/* Total Dispatched Qty */}
        <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-zinc-400 font-normal">Dispatched</p>
            <p className="text-xs sm:text-sm font-semibold text-zinc-100">
              {totalQuantity.toLocaleString()} <span className="text-[10px] text-zinc-500 font-normal">packages</span>
            </p>
          </div>
          <Truck size={14} className="text-indigo-400/70" />
        </div>

        {/* Total Value to Collect */}
        <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-zinc-400 font-normal">Amount to Collect</p>
            <p className="text-xs sm:text-sm font-semibold text-indigo-300">
              ৳{totalAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
          <TrendingUp size={14} className="text-indigo-400/70" />
        </div>

        {/* Delivered Value */}
        <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-zinc-400 font-normal">Delivered Value</p>
            <p className="text-xs sm:text-sm font-semibold text-emerald-400">
              ৳{deliveredAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
              <span className="text-[10px] text-zinc-400 font-normal">
                ({deliveredCount})
              </span>
            </p>
          </div>
          <PackageCheck size={14} className="text-emerald-400/70" />
        </div>

        {/* Returned Value */}
        <div className="bg-zinc-950/50 border border-zinc-800/60 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-zinc-400 font-normal">Returned Value</p>
            <p className="text-xs sm:text-sm font-semibold text-rose-400">
              ৳{returnedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}{" "}
              <span className="text-[10px] text-zinc-400 font-normal">
                ({returnedCount})
              </span>
            </p>
          </div>
          <RotateCcw size={14} className="text-rose-400/70" />
        </div>
      </div>

      {/* Date Filter Strip */}
      <div className="pt-1 border-t border-zinc-800/60 flex items-center gap-1 overflow-x-auto scrollbar-hide">
        <span className="text-[10px] text-zinc-500 flex items-center gap-0.5 mr-0.5 shrink-0">
          <Filter size={10} /> Period:
        </span>
        {DATE_PRESETS.map((preset) => {
          const isActive = activeDateFilter === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => setFilter(preset.id)}
              disabled={isPending}
              className={`px-2 py-0.5 rounded text-[11px] whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 font-medium"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Custom Date Range Picker */}
      {showCustomInputs && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <Calendar size={11} className="text-indigo-400" />
            <span>From:</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 text-zinc-200 text-[11px] rounded px-2 py-0.5 outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            <span>To:</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-zinc-950 border border-zinc-700 text-zinc-200 text-[11px] rounded px-2 py-0.5 outline-none focus:border-indigo-500"
            />
          </div>
          <button
            onClick={applyCustomDates}
            disabled={isPending || !customStart || !customEnd}
            className="px-2.5 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-medium transition-colors disabled:opacity-50"
          >
            {isPending ? "Applying..." : "Apply"}
          </button>
        </div>
      )}
    </div>
  );
}
