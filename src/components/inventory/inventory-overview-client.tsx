"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Boxes,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  PackageCheck,
  PackagePlus,
  PackageMinus,
  Search,
  History,
  Tags,
  AlertTriangle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Clock,
  ArrowUpDown,
  Tag,
  Hash,
  Eye,
} from "lucide-react";
import type {
  InventoryOverviewStats,
  ProductStockSummary,
  InventoryTransaction,
} from "@/types/inventory";
import { ProductDetailsDrawer } from "./product-details-drawer";
import { TransactionDetailsModal } from "./transaction-details-modal";

interface InventoryOverviewClientProps {
  stats: InventoryOverviewStats;
  products: ProductStockSummary[];
  totalProductsCount: number;
  lowStockProducts: ProductStockSummary[];
  topStockIn: ProductStockSummary[];
  topStockOut: ProductStockSummary[];
  recentTransactions: InventoryTransaction[];
  recentlyAdded: ProductStockSummary[];
  currentPage: number;
  pageSize: number;
  currentSearch?: string;
  currentSortBy?: string;
  currentSortOrder?: string;
  userRole?: string;
}

export function InventoryOverviewClient({
  stats,
  products,
  totalProductsCount,
  lowStockProducts,
  topStockIn,
  topStockOut,
  recentTransactions,
  recentlyAdded,
  currentPage,
  pageSize,
  currentSearch = "",
  currentSortBy = "updated_at",
  currentSortOrder = "desc",
  userRole = "staff",
}: InventoryOverviewClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState(currentSearch);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<InventoryTransaction | null>(null);

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
          router.push(`/inventory?${params.toString()}`);
        });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery, currentSearch, router]);

  const handleSort = (field: string) => {
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      const isAsc = currentSortBy === field && currentSortOrder === "asc";
      params.set("sortBy", field);
      params.set("sortOrder", isAsc ? "desc" : "asc");
      params.set("page", "1");
      router.push(`/inventory?${params.toString()}`);
    });
  };

  const handlePageChange = (newPage: number) => {
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("page", newPage.toString());
      router.push(`/inventory?${params.toString()}`);
    });
  };

  const totalPages = Math.ceil(totalProductsCount / pageSize);

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Boxes className="text-indigo-400" size={24} />
            Inventory Overview
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5">
            Real-time manual stock ledger & item balances
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/inventory/stock-in"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm shadow-emerald-950 transition-all active:scale-95"
          >
            <PackagePlus size={15} />
            Stock In Entry
          </Link>

          <Link
            href="/inventory/stock-out"
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 shadow-sm shadow-rose-950 transition-all active:scale-95"
          >
            <PackageMinus size={15} />
            Stock Out Entry
          </Link>

          <Link
            href="/inventory/history"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
          >
            <History size={14} />
            Stock Ledger
          </Link>

          <Link
            href="/inventory/categories"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
          >
            <Tags size={14} />
            Categories
          </Link>
        </div>
      </div>

      {/* 6 Summary Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Unique Products */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Total Products</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Boxes size={15} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-zinc-100">{stats.totalUniqueProducts}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Active items</p>
          </div>
        </div>

        {/* Total Stock Received */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Stock Received</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <ArrowDownLeft size={15} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-emerald-400">+{stats.totalStockReceived}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Lifetime received</p>
          </div>
        </div>

        {/* Total Stock Out */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Total Stock Out</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
              <ArrowUpRight size={15} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-rose-400">-{stats.totalStockOut}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Dispatched / sold</p>
          </div>
        </div>

        {/* Current Available Stock */}
        <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-indigo-300">Available Stock</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center">
              <PackageCheck size={15} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-2xl font-bold text-white">{stats.currentAvailableStock}</p>
            <p className="text-[10px] text-indigo-400/80 mt-0.5">Total in hand</p>
          </div>
        </div>

        {/* Today's Stock In */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Today&apos;s In</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <TrendingUp size={15} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-emerald-400">+{stats.todayStockIn}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Recorded today</p>
          </div>
        </div>

        {/* Today's Stock Out */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-400">Today&apos;s Out</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <TrendingDown size={15} />
            </div>
          </div>
          <div className="mt-2">
            <p className="text-xl font-bold text-amber-400">-{stats.todayStockOut}</p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Dispatched today</p>
          </div>
        </div>
      </div>

      {/* Additional Sections: Low Stock, Top In/Out, Recent Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Low Stock Products */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <AlertTriangle size={14} className="text-amber-400" />
              Low Stock Alerts
            </h3>
            <span className="text-[11px] text-zinc-500">&le; 5 units</span>
          </div>

          <div className="flex-1 space-y-2">
            {lowStockProducts.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">No low stock items. All good!</p>
            ) : (
              lowStockProducts.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProductId(p.id)}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 hover:bg-zinc-800/60 border border-zinc-800/80 cursor-pointer transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-medium text-zinc-200 truncate">{p.product_name}</p>
                    <p className="text-[10px] font-mono text-zinc-500 truncate">
                      {p.sku ? `SKU: ${p.sku}` : "No SKU"}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${
                    (p.current_stock || 0) <= 0
                      ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  }`}>
                    {p.current_stock || 0} left
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Movers (In vs Out) */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp size={14} className="text-indigo-400" />
              Top Stock Movers
            </h3>
            <span className="text-[11px] text-zinc-500">Volume</span>
          </div>

          <div className="flex-1 space-y-2">
            {topStockOut.length === 0 && topStockIn.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">No transaction records yet</p>
            ) : (
              topStockOut.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProductId(p.id)}
                  className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 hover:bg-zinc-800/60 border border-zinc-800/80 cursor-pointer transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-medium text-zinc-200 truncate">{p.product_name}</p>
                    <p className="text-[10px] text-zinc-500">
                      In: +{p.total_stock_in || 0} | Avail: {p.current_stock || 0}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 shrink-0">
                    -{p.total_stock_out || 0} out
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Transactions Feed */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={14} className="text-zinc-400" />
              Recent Transactions
            </h3>
            <Link href="/inventory/history" className="text-[11px] text-indigo-400 hover:underline">
              View all
            </Link>
          </div>

          <div className="flex-1 space-y-2">
            {recentTransactions.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">No recent entries</p>
            ) : (
              recentTransactions.slice(0, 4).map((tx) => {
                const isStockIn = tx.transaction_type === "STOCK_IN" || tx.transaction_type === "ADJUSTMENT_IN";
                return (
                  <div
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 hover:bg-zinc-800/60 border border-zinc-800/80 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-xs font-medium text-zinc-200 truncate">
                        {tx.inventory_products?.product_name || "Product"}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate">
                        {tx.reference_id ? `Ref: ${tx.reference_id}` : tx.transaction_number}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold shrink-0 ${
                      isStockIn
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    }`}>
                      {isStockIn ? "+" : "-"}{tx.quantity}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Main Inventory Ledger Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        
        {/* Table Controls */}
        <div className="p-4 border-b border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wide">
              Product Stock Master
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
              {totalProductsCount} items
            </span>
            {isPending && <Loader2 size={14} className="animate-spin text-indigo-400 ml-2" />}
          </div>

          {/* Search box */}
          <div className="relative w-full sm:w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by Name, SKU, Style..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-hidden focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th
                  onClick={() => handleSort("product_name")}
                  className="py-3 px-4 cursor-pointer hover:text-zinc-200 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Product Name</span>
                    <ArrowUpDown size={12} className="text-zinc-500" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("sku")}
                  className="py-3 px-4 cursor-pointer hover:text-zinc-200 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>SKU</span>
                    <ArrowUpDown size={12} className="text-zinc-500" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("style_code")}
                  className="py-3 px-4 cursor-pointer hover:text-zinc-200 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Style Code</span>
                    <ArrowUpDown size={12} className="text-zinc-500" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("total_stock_in")}
                  className="py-3 px-4 text-right cursor-pointer hover:text-zinc-200 select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Total In</span>
                    <ArrowUpDown size={12} className="text-zinc-500" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("total_stock_out")}
                  className="py-3 px-4 text-right cursor-pointer hover:text-zinc-200 select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Total Out</span>
                    <ArrowUpDown size={12} className="text-zinc-500" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("current_stock")}
                  className="py-3 px-4 text-right cursor-pointer hover:text-zinc-200 select-none"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Available Stock</span>
                    <ArrowUpDown size={12} className="text-zinc-500" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("last_transaction_date")}
                  className="py-3 px-4 cursor-pointer hover:text-zinc-200 select-none"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Last Movement</span>
                    <ArrowUpDown size={12} className="text-zinc-500" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-zinc-500 text-xs">
                    {searchQuery
                      ? `No products found matching "${searchQuery}".`
                      : "No products added yet. Click 'Stock In Entry' to record your first product."}
                  </td>
                </tr>
              ) : (
                products.map((p) => {
                  const available = p.current_stock || 0;
                  const isLow = available <= 5 && available > 0;
                  const isOut = available <= 0;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-zinc-800/40 transition-colors group cursor-pointer"
                      onClick={() => setSelectedProductId(p.id)}
                    >
                      {/* Product Name */}
                      <td className="py-3.5 px-4 font-medium text-zinc-100 group-hover:text-indigo-300 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="truncate max-w-xs">{p.product_name}</span>
                          {p.status === "archived" && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-500 border border-zinc-700">
                              Archived
                            </span>
                          )}
                        </div>
                      </td>

                      {/* SKU */}
                      <td className="py-3.5 px-4 font-mono text-zinc-400">
                        {p.sku || <span className="text-zinc-600">—</span>}
                      </td>

                      {/* Style Code */}
                      <td className="py-3.5 px-4 font-mono text-zinc-400">
                        {p.style_code || <span className="text-zinc-600">—</span>}
                      </td>

                      {/* Total In */}
                      <td className="py-3.5 px-4 text-right font-medium text-emerald-400 font-mono">
                        +{p.total_stock_in || 0}
                      </td>

                      {/* Total Out */}
                      <td className="py-3.5 px-4 text-right font-medium text-rose-400 font-mono">
                        -{p.total_stock_out || 0}
                      </td>

                      {/* Current Available Stock */}
                      <td className="py-3.5 px-4 text-right font-mono">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-lg text-xs font-bold ${
                            isOut
                              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              : isLow
                              ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              : "bg-indigo-500/15 text-indigo-300 border border-indigo-500/25"
                          }`}
                        >
                          {available} pcs
                        </span>
                      </td>

                      {/* Last Movement */}
                      <td className="py-3.5 px-4 text-zinc-400 text-[11px]">
                        {p.last_transaction_date ? (
                          new Date(p.last_transaction_date).toLocaleDateString("en-BD", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        ) : (
                          <span className="text-zinc-600">Never</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedProductId(p.id)}
                            className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                            title="View Stock Ledger History"
                          >
                            <Eye size={15} />
                          </button>

                          <Link
                            href={`/inventory/stock-in?productId=${p.id}&name=${encodeURIComponent(p.product_name)}`}
                            className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors"
                            title="Stock In for this item"
                          >
                            <PackagePlus size={15} />
                          </Link>

                          <Link
                            href={`/inventory/stock-out?productId=${p.id}&name=${encodeURIComponent(p.product_name)}`}
                            className={`p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors ${
                              isOut ? "opacity-30 pointer-events-none" : ""
                            }`}
                            title="Stock Out for this item"
                          >
                            <PackageMinus size={15} />
                          </Link>
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

      {/* Transaction Details Modal */}
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

