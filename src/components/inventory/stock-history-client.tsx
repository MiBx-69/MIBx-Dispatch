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
} from "lucide-react";
import { toast } from "sonner";
import type {
  InventoryTransaction,
  InventorySourceCategory,
  ProductStockSummary,
} from "@/types/inventory";
import { TransactionDetailsModal } from "./transaction-details-modal";
import { ProductDetailsDrawer } from "./product-details-drawer";

interface StockHistoryClientProps {
  transactions: InventoryTransaction[];
  totalCount: number;
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
  const [isPending, startTransition] = useTransition();

  // Search state
  const [searchQuery, setSearchQuery] = useState(currentSearch);
  const [typeFilter, setTypeFilter] = useState(currentType);
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <History className="text-indigo-400" size={24} />
            Stock Ledger & Audit History
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Centralized chronological log of all stock in, stock out, and adjustment transactions
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={isExporting || totalCount === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors disabled:opacity-40"
          >
            {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            <span>Export CSV</span>
          </button>

          <Link
            href="/inventory/stock-in"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition-all"
          >
            + Stock In
          </Link>

          <Link
            href="/inventory/stock-out"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-sm transition-all"
          >
            - Stock Out
          </Link>
        </div>
      </div>

      {/* Main Filter & Search Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4 shadow-xs">
        
        {/* Global Search Input */}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Global search by Product Name, SKU, Style, Transaction ID, Reference, Source Category, Staff, or Notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-zinc-950 border border-zinc-700/80 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Date Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] font-medium text-zinc-400 mr-1 flex items-center gap-1">
            <Calendar size={12} /> Date Range:
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1 border-t border-zinc-800/60">
          
          {/* Transaction Type Filter */}
          <div>
            <label className="text-[10px] text-zinc-400 font-medium block mb-1">Type</label>
            <select
              value={currentType}
              onChange={(e) => updateParam("type", e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="all">All Movements</option>
              <option value="STOCK_IN">Stock In (+)</option>
              <option value="STOCK_OUT">Stock Out (-)</option>
            </select>
          </div>

          {/* Product Filter */}
          <div>
            <label className="text-[10px] text-zinc-400 font-medium block mb-1">Product</label>
            <select
              value={currentProductId}
              onChange={(e) => updateParam("productId", e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="">All Products</option>
              {productsList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_name}
                </option>
              ))}
            </select>
          </div>

          {/* Source Category Filter */}
          <div>
            <label className="text-[10px] text-zinc-400 font-medium block mb-1">Source Category</label>
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
            <label className="text-[10px] text-zinc-400 font-medium block mb-1">Stock Out Reason</label>
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
            <label className="text-[10px] text-zinc-400 font-medium block mb-1">Staff Member</label>
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

      {/* Ledger Table Card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        
        {/* Table Title Bar */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">
              Stock Transactions
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
              {totalCount} total entries
            </span>
            {isPending && <Loader2 size={14} className="animate-spin text-indigo-400 ml-2" />}
          </div>
        </div>

        {/* Responsive Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="py-3 px-4">Transaction ID</th>
                <th className="py-3 px-4">Date & Time</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">SKU / Style</th>
                <th className="py-3 px-4 text-center">Type</th>
                <th className="py-3 px-4 text-right">Qty</th>
                <th className="py-3 px-4">Source / Reason</th>
                <th className="py-3 px-4">Reference ID</th>
                <th className="py-3 px-4">Staff</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-zinc-500 text-xs">
                    {searchQuery || currentType !== "all" || currentCategoryId || currentReason || currentStaffId
                      ? "No stock transactions found matching your active filters."
                      : "No stock movements recorded yet."}
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isStockIn = tx.transaction_type === "STOCK_IN" || tx.transaction_type === "ADJUSTMENT_IN";
                  const isAdjustment = tx.transaction_type.startsWith("ADJUSTMENT_");
                  const hasCorrections = (tx.corrections && tx.corrections.length > 0);

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
                      {/* Transaction ID */}
                      <td className="py-3.5 px-4 font-mono font-medium text-zinc-200 group-hover:text-indigo-300 transition-colors">
                        <div className="flex items-center gap-1.5">
                          <span>{tx.transaction_number}</span>
                          {hasCorrections && (
                            <span title="Corrected" className="text-amber-400">
                              <AlertTriangle size={12} />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td className="py-3.5 px-4 text-zinc-300">
                        <div>{dateFormatted}</div>
                        <div className="text-[10px] text-zinc-500">{timeFormatted}</div>
                      </td>

                      {/* Product Name */}
                      <td className="py-3.5 px-4 font-semibold text-zinc-100 max-w-xs truncate">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProductId(tx.product_id);
                          }}
                          className="hover:text-indigo-400 text-left hover:underline truncate max-w-xs"
                          title="View Product History"
                        >
                          {tx.inventory_products?.product_name || "Unknown Product"}
                        </button>
                      </td>

                      {/* SKU / Style */}
                      <td className="py-3.5 px-4 font-mono text-zinc-400">
                        {tx.inventory_products?.sku || tx.inventory_products?.style_code ? (
                          <div className="space-y-0.5">
                            {tx.inventory_products.sku && <div>{tx.inventory_products.sku}</div>}
                            {tx.inventory_products.style_code && (
                              <div className="text-[10px] text-zinc-500">
                                Style: {tx.inventory_products.style_code}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Transaction Type */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            isStockIn
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {isStockIn ? <ArrowDownLeft size={12} /> : <ArrowUpRight size={12} />}
                          {isAdjustment ? "ADJUST" : isStockIn ? "IN" : "OUT"}
                        </span>
                      </td>

                      {/* Quantity */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold">
                        <span className={isStockIn ? "text-emerald-400" : "text-rose-400"}>
                          {isStockIn ? "+" : "-"}
                          {tx.quantity}
                        </span>
                      </td>

                      {/* Source Category / Reason */}
                      <td className="py-3.5 px-4 text-zinc-300">
                        {tx.source_category_snapshot ||
                        tx.inventory_source_categories?.name ||
                        tx.stock_out_reason || (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>

                      {/* Reference ID */}
                      <td className="py-3.5 px-4 font-mono text-zinc-300">
                        {tx.reference_id || <span className="text-zinc-600">—</span>}
                      </td>

                      {/* Staff */}
                      <td className="py-3.5 px-4 text-zinc-300">
                        <div className="flex items-center gap-1.5">
                          <User size={12} className="text-indigo-400" />
                          <span className="truncate max-w-[120px]">
                            {tx.profiles?.full_name || "Staff"}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedTx(tx)}
                            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            title="View Full Transaction Details"
                          >
                            <Eye size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
            <p>
              Page <span className="text-zinc-200 font-semibold">{currentPage}</span> of{" "}
              <span className="text-zinc-200 font-semibold">{totalPages}</span>
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                <ChevronLeft size={14} />
                Previous
              </button>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isPending}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40 disabled:pointer-events-none transition-colors"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        userRole={userRole}
        onCorrectionSuccess={() => {
          router.refresh();
        }}
      />

      {/* Product-Level Details Drawer */}
      <ProductDetailsDrawer
        productId={selectedProductId}
        onClose={() => setSelectedProductId(null)}
        onStockIn={(prod) => {
          setSelectedProductId(null);
          router.push(`/inventory/stock-in?productId=${prod.id}&name=${encodeURIComponent(prod.product_name)}`);
        }}
        onStockOut={(prod) => {
          setSelectedProductId(null);
          router.push(`/inventory/stock-out?productId=${prod.id}&name=${encodeURIComponent(prod.product_name)}`);
        }}
        onSelectTransaction={(tx) => setSelectedTx(tx)}
      />
    </div>
  );
}

