"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { Calendar, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function DashboardHeader() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dateFilter, setDateFilter] = useState("this_month");
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const filter = searchParams.get("dateFilter");
    if (filter) {
      setDateFilter(filter);
    } else {
      setDateFilter("this_month");
    }
  }, [searchParams]);

  const handleFilterChange = (val: string) => {
    setDateFilter(val);
    const params = new URLSearchParams(searchParams.toString());
    params.set("dateFilter", val);
    router.push(`/?${params.toString()}`);
  };

  const handleQuickSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    const toastId = toast.loading("Syncing with Pathao Courier...");
    try {
      const res = await fetch("/api/pathao/sync-status?days=this_month&force=true", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      toast.success("Pathao Sync Completed!", {
        id: toastId,
        description: `Checked ${data.checked || data.totalChecked || 0} parcels. Updated ${data.updated || data.updatedCount || 0} orders.`,
      });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to sync", { id: toastId });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Dashboard Overview</h1>
        <p className="text-sm text-zinc-400 mt-1">Key metrics and reporting across your operations.</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleQuickSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 border border-amber-500/25 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          title="Scan & sync all Pathao statuses for this month"
        >
          <RefreshCw size={14} className={isSyncing ? "animate-spin text-amber-400" : "text-amber-400"} />
          <span className="hidden sm:inline">{isSyncing ? "Syncing..." : "Sync Pathao"}</span>
        </button>

        <div className="relative">
          <select
            value={dateFilter}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-lg outline-none focus:border-indigo-500 transition-colors appearance-none"
          >
            <option value="this_month">This Month (Default)</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="last_30_days">Last 30 Days</option>
          </select>
          <Calendar className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}
