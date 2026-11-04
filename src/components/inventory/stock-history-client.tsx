"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  History,
  Search,
  Filter,
  Download,
  ArrowDownLeft,
  ArrowUpRight,
  User,
  Calendar,
  Tag,
  Hash,
  Boxes,
  FileText,
  RotateCcw,
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  X,
  Layers,
  AlertTriangle,
  Calculator,
  PackagePlus,
  PackageMinus,
  Tags,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import type {
  InventoryTransaction,
  InventorySourceCategory,
  ProductStockSummary,
  InventoryOverviewStats,
} from "@/types/inventory";
import { TransactionDetailsModal } from "./transaction-details-modal";
import { ProductDetailsDrawer } from "./product-details-drawer";

interface StockHistoryClientProps {
  transactions: InventoryTransaction[];
  totalCount: number;
  stats?: InventoryOverviewStats;
  categories: InventorySourceCategory[];
  staffMembers: { id: string; full_name: string | null }[];
  productsList: { id: string; product_name: string }[];
  reasons: string[];
  currentPage: number;
  pageSize: number;
  currentSearch?: string;
  currentType?: string;
  currentCategoryId?: string;
  currentReason?: string;
  currentStaffId?: string;
  currentProductId?: string;
  currentDateFilter?: string;
  currentStartDate?: string;
  currentEndDate?: string;
  userRole?: string;
}

export function StockHistoryClient({
  transactions,
  totalCount,
  stats,
  categories,
  staffMembers,
  productsList,
  reasons,
  currentPage,
  pageSize,
  currentSearch = "",
  currentType = "all",
  currentCategoryId = "",
  currentReason = "",
  currentStaffId = "",
  currentProductId = "",
  currentDateFilter = "all",
  currentStartDate = "",
  currentEndDate = "",
  userRole = "staff",
}: StockHistoryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Search state
  const [searchQuery, setSearchQuery] = useState(currentSearch);
  const [selectedTx, setSelectedTx] = useState<InventoryTransaction | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Debounce search update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== currentSearch) {
        startTransition(() => {
          const params = new URLSearchParams(window.location.search);
          if (searchQuery.trim()) {
            params.set("search", searchQuery.trim());
          } else {
            params.delete("search");
          }
          params.set("page", "1");
          router.push(`/inventory/history?${params.toString()}`);
        });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, currentSearch, router]);

  const updateParam = (key: string, value: string) => {
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set("page", "1");
      router.push(`/inventory/history?${params.toString()}`);
    });
  };

  const handlePageChange = (newPage: number) => {
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("page", newPage.toString());
      router.push(`/inventory/history?${params.toString()}`);
    });
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const url = `/api/inventory/export?${params.toString()}`;
      window.location.href = url;
      toast.success("CSV export downloaded successfully");
    } catch {
      toast.error("Failed to generate CSV export");
    } finally {
      setIsExporting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // Calculations for incoming, outgoing, and net balance
  const totalIncoming = stats
    ? stats.totalStockReceived
    : transactions
        .filter((t) => t.transaction_type === "STOCK_IN" || t.transaction_type === "ADJUSTMENT_IN")
        .reduce((sum, t) => sum + t.quantity, 0);

  const totalOutgoing = stats
    ? stats.totalStockOut
    : transactions
        .filter((t) => t.transaction_type === "STOCK_OUT" || t.transaction_type === "ADJUSTMENT_OUT")
        .reduce((sum, t) => sum + t.quantity, 0);

  const netBalance = stats ? stats.currentAvailableStock : totalIncoming - totalOutgoing;

  // Loaded page calculations
  const pageIncoming = transactions
    .filter((t) => t.transaction_type === "STOCK_IN" || t.transaction_type === "ADJUSTMENT_IN")
    .reduce((sum, t) => sum + t.quantity, 0);

  const pageOutgoing = transactions
    .filter((t) => t.transaction_type === "STOCK_OUT" || t.transaction_type === "ADJUSTMENT_OUT")
    .reduce((sum, t) => sum + t.quantity, 0);

  const DATE_PRESETS = [
    { label: "All Time", value: "all" },
    { label: "Today", value: "today" },
    { label: "Last 7 Days", value: "last_7_days" },
    { label: "Last 30 Days", value: "last_30_days" },
    { label: "This Month", value: "this_month" },
    { label: "Last Month", value: "last_month" },
  ];

  return (
    <div className="space-y-6">
      {/* Top Module Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-zinc-900 border border-zinc-800 rounded-2xl w-fit shadow-xs">
        <Link
          href="/inventory"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <Boxes size={14} />
          Stock Overview
        </Link>
        <Link
          href="/inventory/history"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-xs"
        >
          <BookOpen size={14} className="text-indigo-400" />
          Stock Ledger Book
        </Link>
        <Link
          href="/inventory/stock-in"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors"
        >
          <PackagePlus size={14} />
          + Stock In Entry
        </Link>
        <Link
          href="/inventory/stock-out"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
        >
          <PackageMinus size={14} />
          - Stock Out Entry
        </Link>
        <Link
          href="/inventory/categories"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        >
          <Tags size={14} />
          Categories
        </Link>
      </div>

      {/* Header with Title and Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <BookOpen className="text-indigo-400" size={24} />
            Stock Ledger Book
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Double-entry stock movement register for incoming stock, outgoing stock, and live balance calculations
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={isExporting || totalCount === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-40"
            title="Download complete Stock Ledger as CSV"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Export Ledger CSV</span>
          </button>

          <Link
            href="/inventory/stock-in"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm shadow-emerald-950 transition-all active:scale-95"
          >
            <PackagePlus size={14} />
            Record Stock In
          </Link>

          <Link
            href="/inventory/stock-out"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-sm shadow-rose-950 transition-all active:scale-95"
          >
            <PackageMinus size={14} />
            Record Stock Out
          </Link>
        </div>
      </div>

      {/* Grand Stock Ledger Calculation Banner */}
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-900 to-indigo-950/30 border border-zinc-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-3 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Calculator size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">
                Stock Calculation Formula
              </h2>
              <p className="text-xs text-indigo-300 font-mono">
                Current Available Stock = Total Incoming (Stock In) − Total Outgoing (Stock Out)
              </p>
            </div>
          </div>

          {stats && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-zinc-950/80 border border-zinc-800 text-zinc-300 font-mono">
                📅 Today&apos;s In: <strong className="text-emerald-400">+{stats.todayStockIn}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-zinc-950/80 border border-zinc-800 text-zinc-300 font-mono">
                Today&apos;s Out: <strong className="text-rose-400">-{stats.todayStockOut}</strong>
              </span>
              <span
                className={`px-2.5 py-1 rounded-lg bg-zinc-950/80 border border-zinc-800 font-mono font-semibold ${
                  stats.todayStockIn - stats.todayStockOut >= 0 ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                Net Today:{" "}
                {stats.todayStockIn - stats.todayStockOut >= 0
                  ? `+${stats.todayStockIn - stats.todayStockOut}`
                  : stats.todayStockIn - stats.todayStockOut}
              </span>
            </div>
          )}
        </div>

        {/* 3 Large Calculation Breakdown Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* 1. Total Incoming Stock */}
          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-emerald-400 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <ArrowDownLeft size={16} /> 1. TOTAL INCOMING (+)
              </span>
              <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                STOCK IN
              </span>
            </div>
            <div className="my-2">
              <p className="text-3xl font-black text-emerald-300 font-mono">
                +{totalIncoming.toLocaleString()}
                <span className="text-xs font-normal text-emerald-400/80 ml-1.5">units</span>
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                Purchases, factory production, supplier deliveries & returned restocks
              </p>
            </div>
            <div className="pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[11px] text-zinc-400">
              <span>This page: +{pageIncoming} units</span>
              <button
                onClick={() => updateParam("type", "STOCK_IN")}
                className="text-emerald-400 hover:underline font-medium"
              >
                View Incoming Only &rarr;
              </button>
            </div>
          </div>

          {/* 2. Total Outgoing Stock */}
          <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-rose-400 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <ArrowUpRight size={16} /> 2. TOTAL OUTGOING (-)
              </span>
              <span className="text-[10px] bg-rose-500/20 px-2 py-0.5 rounded-full font-bold">
                STOCK OUT
              </span>
            </div>
            <div className="my-2">
              <p className="text-3xl font-black text-rose-300 font-mono">
                -{totalOutgoing.toLocaleString()}
                <span className="text-xs font-normal text-rose-400/80 ml-1.5">units</span>
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                Dispatched Shopify customer orders, showroom sales, and damaged removals
              </p>
            </div>
            <div className="pt-2 border-t border-rose-500/20 flex items-center justify-between text-[11px] text-zinc-400">
              <span>This page: -{pageOutgoing} units</span>
              <button
                onClick={() => updateParam("type", "STOCK_OUT")}
                className="text-rose-400 hover:underline font-medium"
              >
                View Outgoing Only &rarr;
              </button>
            </div>
          </div>

          {/* 3. Current Stock Balance */}
          <div className="bg-indigo-950/30 border border-indigo-500/40 rounded-xl p-4 flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between text-indigo-300 text-xs font-semibold">
              <span className="flex items-center gap-1.5">
                <Boxes size={16} /> 3. AVAILABLE BALANCE (=)
              </span>
              <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-full font-mono font-bold">
                NET STOCK
              </span>
            </div>
            <div className="my-2">
              <p className="text-3xl font-black text-white font-mono">
                {netBalance.toLocaleString()}
                <span className="text-xs font-normal text-indigo-300 ml-1.5">units in hand</span>
              </p>
              <p className="text-[11px] text-zinc-400 mt-1">
                Database-calculated current inventory available for sale & dispatch
              </p>
            </div>
            <div className="pt-2 border-t border-indigo-500/20 flex items-center justify-between text-[11px] text-zinc-400">
              <span>{stats?.totalUniqueProducts || productsList.length} active products</span>
              <Link href="/inventory" className="text-indigo-400 hover:underline font-medium">
                View Product Balances &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Movement Mode Tabs (Ledger Book / Incoming Register / Outgoing Register) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
        <button
          onClick={() => updateParam("type", "all")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            currentType === "all"
              ? "bg-zinc-100 text-zinc-950 shadow-sm"
              : "bg-zinc-900 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800"
          }`}
        >
          <BookOpen size={14} />
          Complete Stock Ledger Book ({totalCount})
        </button>

        <button
          onClick={() => updateParam("type", "STOCK_IN")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            currentType === "STOCK_IN"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-zinc-900 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 border border-zinc-800"
          }`}
        >
          <ArrowDownLeft size={14} />
          📥 Incoming Stock Register (+ Stock In)
        </button>

        <button
          onClick={() => updateParam("type", "STOCK_OUT")}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
            currentType === "STOCK_OUT"
              ? "bg-rose-600 text-white shadow-sm"
              : "bg-zinc-900 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 border border-zinc-800"
          }`}
        >
          <ArrowUpRight size={14} />
          📤 Outgoing Stock Register (- Stock Out)
        </button>
      </div>

      {/* Main Filter & Search Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4 shadow-xs">
        {/* Global Search Input */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search ledger by Product Name, SKU, Style Code, Voucher #, Order Ref, Vendor, Staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              title="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Date Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-medium text-zinc-400 mr-1 flex items-center gap-1">
            <Calendar size={12} /> Period:
          </span>
          {DATE_PRESETS.map((p) => {
            const isActive = currentDateFilter === p.value;
            return (
              <button
                key={p.value}
                onClick={() => updateParam("dateFilter", p.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                    : "bg-zinc-950/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Filter Dropdowns Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 border-t border-zinc-800/60">
          {/* Product Filter */}
          <div>
            <label className="text-[10px] text-zinc-400 font-medium block mb-1">Filter by Product</label>
            <select
              value={currentProductId}
              onChange={(e) => updateParam("productId", e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">All Products ({productsList.length})</option>
              {productsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_name}
                </option>
              ))}
            </select>
          </div>

          {/* Source Category Filter */}
          <div>
            <label className="text-[10px] text-zinc-400 font-medium block mb-1">Source (Stock In)</label>
            <select
              value={currentCategoryId}
              onChange={(e) => updateParam("categoryId", e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">All Sources</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reason Filter */}
          <div>
            <label className="text-[10px] text-zinc-400 font-medium block mb-1">Reason (Stock Out)</label>
            <select
              value={currentReason}
              onChange={(e) => updateParam("reason", e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">All Reasons</option>
              {reasons.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Staff Filter */}
          <div>
            <label className="text-[10px] text-zinc-400 font-medium block mb-1">Recorded By Staff</label>
            <select
              value={currentStaffId}
              onChange={(e) => updateParam("staffId", e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">All Staff</option>
              {staffMembers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name || "Staff"}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Ledger Book Table Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        {/* Table Title Bar */}
        <div className="p-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
              <BookOpen size={16} className="text-indigo-400" />
              Stock Ledger Entries
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono border border-zinc-700">
              {totalCount} movements recorded
            </span>
            {isPending && <Loader2 size={14} className="animate-spin text-indigo-400 ml-2" />}
          </div>

          <div className="flex items-center gap-3 text-xs text-zinc-400 font-mono">
            <span className="flex items-center gap-1 text-emerald-400">
              <ArrowDownLeft size={13} /> Page In: +{pageIncoming}
            </span>
            <span className="text-zinc-700">|</span>
            <span className="flex items-center gap-1 text-rose-400">
              <ArrowUpRight size={13} /> Page Out: -{pageOutgoing}
            </span>
            <span className="text-zinc-700">|</span>
            <span className="text-zinc-200 font-bold">
              Net Impact: {pageIncoming - pageOutgoing >= 0 ? `+${pageIncoming - pageOutgoing}` : pageIncoming - pageOutgoing}
            </span>
          </div>
        </div>

        {/* Responsive Stock Ledger Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 font-semibold tracking-wider uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Voucher / TXN #</th>
                <th className="py-3 px-4">Product & SKU</th>
                <th className="py-3 px-4">Movement Details & Ref</th>
                <th className="py-3 px-4 text-right text-emerald-400 bg-emerald-950/10">INCOMING (+)</th>
                <th className="py-3 px-4 text-right text-rose-400 bg-rose-950/10">OUTGOING (-)</th>
                <th className="py-3 px-4 text-right">Cost / Value</th>
                <th className="py-3 px-4">Recorded By</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-14 text-center text-zinc-500 text-xs">
                    <Boxes size={28} className="mx-auto mb-2 text-zinc-600 opacity-60" />
                    {searchQuery || currentType !== "all" || currentCategoryId || currentReason || currentStaffId || currentProductId
                      ? "No stock transactions found matching your active ledger filters."
                      : "No stock movements recorded in the ledger book yet."}
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isStockIn = tx.transaction_type === "STOCK_IN" || tx.transaction_type === "ADJUSTMENT_IN";
                  const isAdjustment = tx.transaction_type.startsWith("ADJUSTMENT_");
                  const hasCorrections = tx.corrections && tx.corrections.length > 0;

                  const dateFormatted = new Date(tx.transaction_date).toLocaleDateString("en-BD", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                  const timeFormatted = new Date(tx.transaction_date).toLocaleTimeString("en-BD", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className="hover:bg-zinc-800/40 transition-colors group cursor-pointer"
                    >
                      {/* Date & Time */}
                      <td className="py-3.5 px-4 text-zinc-300 whitespace-nowrap">
                        <div className="font-medium text-zinc-200">{dateFormatted}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">{timeFormatted}</div>
                      </td>

                      {/* Transaction Voucher Number */}
                      <td className="py-3.5 px-4 font-mono font-medium text-zinc-200 group-hover:text-indigo-300 transition-colors whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{tx.transaction_number}</span>
                          {hasCorrections && (
                            <span title="Corrected entry" className="text-amber-400">
                              <AlertTriangle size={12} />
                            </span>
                          )}
                        </div>
                        {isAdjustment && (
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                            Adjustment
                          </span>
                        )}
                      </td>

                      {/* Product & SKU */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProductId(tx.product_id);
                          }}
                          className="hover:text-indigo-400 font-semibold text-zinc-100 text-left hover:underline truncate max-w-xs block"
                          title="Click to view full product ledger sheet"
                        >
                          {tx.inventory_products?.product_name || "Unknown Product"}
                        </button>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400 mt-0.5">
                          {tx.inventory_products?.sku && <span>SKU: {tx.inventory_products.sku}</span>}
                          {tx.inventory_products?.style_code && (
                            <span className="text-zinc-500">Style: {tx.inventory_products.style_code}</span>
                          )}
                        </div>
                      </td>

                      {/* Movement Details & Particulars */}
                      <td className="py-3.5 px-4 max-w-sm">
                        <div className="space-y-0.5">
                          <p className="font-medium text-zinc-200">
                            {tx.source_category_snapshot ||
                              tx.inventory_source_categories?.name ||
                              tx.stock_out_reason ||
                              "—"}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 text-[10px] text-zinc-400">
                            {tx.reference_id && (
                              <span className="font-mono bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
                                Ref: {tx.reference_id}
                              </span>
                            )}
                            {tx.brought_by && <span>From: {tx.brought_by}</span>}
                            {tx.received_by && <span>To: {tx.received_by}</span>}
                          </div>
                          {tx.notes && (
                            <p className="text-[10px] text-zinc-500 italic truncate max-w-xs">
                              &ldquo;{tx.notes}&rdquo;
                            </p>
                          )}
                        </div>
                      </td>

                      {/* INCOMING (+) Column */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold bg-emerald-950/5">
                        {isStockIn ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <ArrowDownLeft size={13} />
                            +{tx.quantity} <span className="text-[10px] font-normal">pcs</span>
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* OUTGOING (-) Column */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold bg-rose-950/5">
                        {!isStockIn ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <ArrowUpRight size={13} />
                            -{tx.quantity} <span className="text-[10px] font-normal">pcs</span>
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Unit Cost / Total Value */}
                      <td className="py-3.5 px-4 text-right font-mono text-zinc-300 whitespace-nowrap">
                        {tx.total_cost !== null && tx.total_cost !== undefined ? (
                          <div>
                            <span className="font-semibold text-zinc-100">
                              ৳{Number(tx.total_cost).toLocaleString()}
                            </span>
                            {tx.unit_cost && (
                              <div className="text-[10px] text-zinc-500">
                                @ ৳{Number(tx.unit_cost).toFixed(2)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Staff */}
                      <td className="py-3.5 px-4 text-zinc-300 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <User size={12} className="text-zinc-500" />
                          <span>{tx.profiles?.full_name || "Staff Member"}</span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTx(tx);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700/60 transition-colors inline-flex items-center gap-1"
                        >
                          <Eye size={12} />
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-zinc-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-zinc-400">
            <div>
              Showing page <strong className="text-zinc-200">{currentPage}</strong> of{" "}
              <strong className="text-zinc-200">{totalPages}</strong> ({totalCount} total entries)
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Previous
              </button>

              <span className="px-2 font-mono text-zinc-300">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isPending}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Product Details Drawer */}
      <ProductDetailsDrawer
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
        onStockIn={(p) => router.push(`/inventory/stock-in?productId=${p.id}`)}
        onStockOut={(p) => router.push(`/inventory/stock-out?productId=${p.id}`)}
        onSelectTransaction={(tx) => setSelectedTx(tx)}
      />

      {/* Transaction Details & Correction Modal */}
      <TransactionDetailsModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        userRole={userRole}
        onCorrectionSuccess={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
