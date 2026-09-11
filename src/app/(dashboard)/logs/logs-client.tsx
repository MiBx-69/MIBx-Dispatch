"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  Search,
  RefreshCw,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Copy,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Code,
  Smartphone,
  Truck,
  ShoppingBag,
  Layers,
  ArrowUpDown,
  RotateCcw
} from "lucide-react";
import type { UnifiedLogEntry, LogAnalyticsStats } from "@/lib/log-engine";

interface LogsClientProps {
  initialLogs: UnifiedLogEntry[];
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
  analytics: LogAnalyticsStats;
  currentSource: string;
  currentStatus: string;
  currentSearch: string;
  dateFilter: string;
  startDate?: string;
  endDate?: string;
}

const SOURCE_TABS = [
  { id: "all", label: "All Logs", icon: Layers },
  { id: "shopify", label: "Shopify Webhooks", icon: ShoppingBag },
  { id: "pathao", label: "Pathao Courier", icon: Truck },
  { id: "sms", label: "SMS Logs", icon: Smartphone },
  { id: "order", label: "Order Audits", icon: Activity },
  { id: "sync", label: "Sync Jobs", icon: RotateCcw },
  { id: "error", label: "Errors Only", icon: AlertCircle },
];

export function LogsClient({
  initialLogs,
  totalCount,
  currentPage,
  pageSize,
  totalPages,
  analytics,
  currentSource,
  currentStatus,
  currentSearch,
  dateFilter,
  startDate,
  endDate,
}: LogsClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState(currentSearch);
  const [activeTab, setActiveTab] = useState(currentSource);
  const [selectedLog, setSelectedLog] = useState<UnifiedLogEntry | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-refresh interval (10s)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      startTransition(() => {
        router.refresh();
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, router]);

  const updateFilters = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val === undefined || val === "" || val === "all") {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });
    // Reset page to 1 on filter changes unless page is explicitly changed
    if (!updates.page) {
      params.delete("page");
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    if (tabId === "error") {
      updateFilters({ source: "all", status: "error" });
    } else {
      updateFilters({ source: tabId, status: currentStatus === "error" ? "all" : currentStatus });
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilters({ search: search.trim() });
  };

  const handleCopyJson = (content: any) => {
    navigator.clipboard.writeText(typeof content === "string" ? content : JSON.stringify(content, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportUrl = (format: "csv" | "json") => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("format", format);
    return `/api/logs/export?${params.toString()}`;
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "shopify":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Shopify</span>;
      case "pathao":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-500/10 text-orange-400 border border-orange-500/20">Pathao</span>;
      case "sms":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">SMS</span>;
      case "order":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">Order Event</span>;
      case "sync":
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Sync Job</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-700/50 text-zinc-300 border border-zinc-600">System</span>;
    }
  };

  const getStatusBadge = (status: string, error: string | null) => {
    if (error || status === "error") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertCircle className="w-3 h-3" /> Failed
        </span>
      );
    }
    if (status === "pending") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <Clock className="w-3 h-3" /> Pending
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 className="w-3 h-3" /> Success
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Log Analytics</h1>
              <p className="text-xs sm:text-sm text-zinc-400">Comprehensive A-to-Z real-time system and webhook logs</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Live Auto-Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              autoRefresh
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200"
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
            {autoRefresh ? "Live: 10s" : "Auto-Refresh: Off"}
          </button>

          {/* Manual Refresh */}
          <button
            onClick={() => startTransition(() => router.refresh())}
            disabled={isPending}
            className="p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
            title="Refresh now"
          >
            <RefreshCw className={`w-4 h-4 ${isPending ? "animate-spin text-indigo-400" : ""}`} />
          </button>

          {/* Export CSV */}
          <a
            href={exportUrl("csv")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </a>

          {/* Export JSON */}
          <a
            href={exportUrl("json")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700 transition-colors"
          >
            <Code className="w-3.5 h-3.5" />
            JSON
          </a>
        </div>
      </div>

      {/* Analytics KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Logs */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col justify-between">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Total Logs</p>
          <p className="text-2xl font-bold text-white mt-1">{analytics.totalLogs.toLocaleString()}</p>
          <span className="text-[11px] text-zinc-500 mt-1">All events</span>
        </div>

        {/* Success Rate */}
        <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col justify-between">
          <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Success Rate</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{analytics.successRate}%</p>
          <span className="text-[11px] text-emerald-500/80 mt-1">{analytics.successCount.toLocaleString()} passed</span>
        </div>

        {/* Error Count */}
        <div
          onClick={() => handleTabChange("error")}
          className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-rose-500/40 cursor-pointer transition-colors flex flex-col justify-between"
        >
          <p className="text-xs font-medium text-rose-400 uppercase tracking-wider">Errors / Failed</p>
          <p className="text-2xl font-bold text-rose-400 mt-1">{analytics.errorCount.toLocaleString()}</p>
          <span className="text-[11px] text-rose-500/80 mt-1">Click to view</span>
        </div>

        {/* Shopify Webhooks */}
        <div
          onClick={() => handleTabChange("shopify")}
          className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-emerald-500/40 cursor-pointer transition-colors flex flex-col justify-between"
        >
          <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Shopify Hooks</p>
          <p className="text-2xl font-bold text-white mt-1">{analytics.shopifyCount.toLocaleString()}</p>
          <span className="text-[11px] text-zinc-500 mt-1">Orders & updates</span>
        </div>

        {/* Pathao Events */}
        <div
          onClick={() => handleTabChange("pathao")}
          className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-orange-500/40 cursor-pointer transition-colors flex flex-col justify-between"
        >
          <p className="text-xs font-medium text-orange-400 uppercase tracking-wider">Pathao Courier</p>
          <p className="text-2xl font-bold text-white mt-1">{analytics.pathaoCount.toLocaleString()}</p>
          <span className="text-[11px] text-zinc-500 mt-1">Delivery webhooks</span>
        </div>

        {/* SMS Dispatches */}
        <div
          onClick={() => handleTabChange("sms")}
          className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 cursor-pointer transition-colors flex flex-col justify-between"
        >
          <p className="text-xs font-medium text-indigo-400 uppercase tracking-wider">SMS Dispatches</p>
          <p className="text-2xl font-bold text-white mt-1">{analytics.smsCount.toLocaleString()}</p>
          <span className="text-[11px] text-zinc-500 mt-1">Provider & idempotency</span>
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="space-y-4">
        {/* Source Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin border-b border-zinc-800">
          {SOURCE_TABS.map((tab) => {
            const Icon = tab.icon;
            const isTabActive =
              tab.id === "error"
                ? currentStatus === "error"
                : (currentSource === tab.id || (tab.id === "all" && currentSource === "all" && currentStatus !== "error"));

            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                  isTabActive
                    ? tab.id === "error"
                      ? "border-rose-500 text-rose-400 bg-rose-500/10"
                      : "border-indigo-500 text-indigo-400 bg-indigo-500/10"
                    : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {tab.id === "error" && analytics.errorCount > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500/20 text-rose-400 font-bold">
                    {analytics.errorCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-900/80 p-3 rounded-xl border border-zinc-800">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by order #, phone, consignment, topic..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  updateFilters({ search: "" });
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {/* Date Range & Status Selectors */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
            {/* Date Presets */}
            <select
              value={dateFilter}
              onChange={(e) => updateFilters({ dateFilter: e.target.value })}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Time</option>
              <option value="today">Today (BST)</option>
              <option value="yesterday">Yesterday</option>
              <option value="7days">Last 7 Days</option>
              <option value="month">This Month</option>
            </select>

            {/* Status Selector */}
            <select
              value={currentStatus}
              onChange={(e) => updateFilters({ status: e.target.value })}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="success">Success Only</option>
              <option value="error">Errors Only</option>
            </select>

            {/* Clear All Filters */}
            {(currentSearch || currentSource !== "all" || currentStatus !== "all" || dateFilter !== "all") && (
              <button
                onClick={() => {
                  setSearch("");
                  router.push(pathname);
                }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Logs Table */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 text-zinc-400 uppercase tracking-wider font-semibold border-b border-zinc-800">
              <tr>
                <th className="py-3 px-4">Time (BST)</th>
                <th className="py-3 px-4">Source</th>
                <th className="py-3 px-4">Event / Topic</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4">Summary</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-medium">
              {initialLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-zinc-500">
                    <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No logs found matching your filters.
                  </td>
                </tr>
              ) : (
                initialLogs.map((log) => {
                  const bstTime = new Date(log.timestamp).toLocaleString("en-US", {
                    timeZone: "Asia/Dhaka",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  });

                  return (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-zinc-800/40 cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-4 text-zinc-400 whitespace-nowrap font-mono text-[11px]">
                        {bstTime}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {getSourceBadge(log.source)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-zinc-200">
                        {log.topic}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap font-mono font-semibold text-indigo-300">
                        {log.reference || "—"}
                      </td>
                      <td className="py-3 px-4 max-w-md truncate text-zinc-300" title={log.summary}>
                        {log.error ? (
                          <span className="text-rose-400 font-medium">{log.error}</span>
                        ) : (
                          log.summary
                        )}
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {getStatusBadge(log.status, log.error)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-[11px] transition-colors"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-zinc-950/60 border-t border-zinc-800 text-xs text-zinc-400">
            <div>
              Showing <span className="font-semibold text-zinc-200">{((currentPage - 1) * pageSize) + 1}</span> to{" "}
              <span className="font-semibold text-zinc-200">
                {Math.min(currentPage * pageSize, totalCount)}
              </span>{" "}
              of <span className="font-semibold text-zinc-200">{totalCount.toLocaleString()}</span> entries
            </div>

            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => updateFilters({ page: String(currentPage - 1) })}
                className="p-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 text-xs font-semibold text-zinc-200">
                Page {currentPage} of {totalPages}
              </span>

              <button
                disabled={currentPage >= totalPages}
                onClick={() => updateFilters({ page: String(currentPage + 1) })}
                className="p-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* JSON Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-950/80">
              <div className="flex items-center gap-2.5">
                {getSourceBadge(selectedLog.source)}
                <span className="text-sm font-bold text-white font-mono">{selectedLog.topic}</span>
                {selectedLog.reference && (
                  <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-indigo-300 font-mono font-semibold">
                    {selectedLog.reference}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyJson(selectedLog.payload || selectedLog)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Copied!" : "Copy Payload"}
                </button>

                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800 text-[11px]">
                <div>
                  <span className="text-zinc-500 block">Timestamp:</span>
                  <span className="text-zinc-200 font-medium">
                    {new Date(selectedLog.timestamp).toLocaleString("en-US", { timeZone: "Asia/Dhaka" })}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Status:</span>
                  <span className="mt-0.5 inline-block">{getStatusBadge(selectedLog.status, selectedLog.error)}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Log ID:</span>
                  <span className="text-zinc-400 truncate block" title={selectedLog.id}>
                    {selectedLog.id.slice(0, 13)}...
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Order Reference:</span>
                  <span className="text-indigo-400 font-semibold">{selectedLog.reference || "N/A"}</span>
                </div>
              </div>

              {/* Error Box if applicable */}
              {selectedLog.error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300">
                  <div className="flex items-center gap-1.5 font-bold mb-1 text-rose-400">
                    <AlertCircle className="w-4 h-4" />
                    Error Description:
                  </div>
                  <pre className="text-xs whitespace-pre-wrap">{selectedLog.error}</pre>
                </div>
              )}

              {/* Raw JSON Payload */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-zinc-300 font-sans">Raw Payload Data</span>
                </div>
                <pre className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400 text-[11px] overflow-x-auto max-h-96 leading-relaxed select-text">
                  {JSON.stringify(selectedLog.payload, null, 2) || "No payload data recorded"}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-zinc-800 bg-zinc-950/80 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
