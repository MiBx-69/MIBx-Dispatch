"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  RotateCcw,
  Package,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Calendar,
  ExternalLink,
  Trash2,
  Download,
  Layers,
  DollarSign,
} from "lucide-react";

interface ReturnsClientProps {
  returns: any[];
  allFilteredForStats?: any[];
  currentFilter?: string;
  currentSearch?: string;
  currentStartDate?: string;
  currentEndDate?: string;
}

export function ReturnsClient({
  returns: initialReturns,
  allFilteredForStats,
  currentFilter = "all",
  currentSearch = "",
  currentStartDate = "",
  currentEndDate = "",
}: ReturnsClientProps) {
  const router = useRouter();
  const [returns, setReturns] = useState(initialReturns);
  const [filter, setFilter] = useState<string>(currentFilter || "all");
  const [searchQuery, setSearchQuery] = useState(currentSearch || "");
  const [startDate, setStartDate] = useState(currentStartDate || "");
  const [endDate, setEndDate] = useState(currentEndDate || "");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setReturns(initialReturns);
  }, [initialReturns]);

  // Synchronize URL query parameters when search, filter, or date range changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (
        searchQuery !== currentSearch ||
        filter !== currentFilter ||
        startDate !== currentStartDate ||
        endDate !== currentEndDate
      ) {
        startTransition(() => {
          const params = new URLSearchParams();
          if (searchQuery.trim()) params.set("search", searchQuery.trim());
          if (filter && filter !== "all") params.set("filter", filter);
          if (startDate) params.set("startDate", startDate);
          if (endDate) params.set("endDate", endDate);
          const qs = params.toString();
          router.push(qs ? `/returns?${qs}` : "/returns");
        });
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [
    searchQuery,
    filter,
    startDate,
    endDate,
    currentSearch,
    currentFilter,
    currentStartDate,
    currentEndDate,
    router,
  ]);

  const statsSource = allFilteredForStats || returns;

  // Section 9: Simple Return Reporting (without double counting)
  const reportStats = useMemo(() => {
    const partialRows = statsSource.filter((r) => r.return_type === "partial");
    const fullRows = statsSource.filter((r) => r.return_type !== "partial");
    const uniqueOrderIds = new Set(
      statsSource.map((r) => r.order_id).filter(Boolean)
    );
    const totalRefundedAmount = statsSource.reduce(
      (sum, r) => sum + Number(r.refund_amount ?? r.returned_product_value ?? 0),
      0
    );
    const totalReturnedProductQuantities = statsSource.reduce((sum, r) => {
      if (r.returned_quantity != null && Number(r.returned_quantity) > 0) {
        return sum + Number(r.returned_quantity);
      }
      const items = Array.isArray(r.returned_items) ? r.returned_items : [];
      return (
        sum +
        items.reduce(
          (s: number, i: any) => s + Number(i?.quantity ?? i?.return_quantity ?? 1),
          0
        )
      );
    }, 0);
    const syncFailedCount = statsSource.filter(
      (r) => r.shopify_sync_status === "failed"
    ).length;

    return {
      totalPartialReturns: partialRows.length,
      totalFullReturns: fullRows.length,
      totalReturnedOrders: uniqueOrderIds.size,
      totalRefundedAmount,
      totalReturnedProductQuantities,
      syncFailedCount,
    };
  }, [statsSource]);

  const partialReturnsList = useMemo(
    () => returns.filter((r) => r.return_type === "partial"),
    [returns]
  );

  const fullReturnsList = useMemo(
    () => returns.filter((r) => r.return_type !== "partial"),
    [returns]
  );

  const handleRetryShopifySync = async (returnId: string) => {
    setRetryingId(returnId);
    try {
      const res = await fetch(`/api/returns/${returnId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_sync" }),
      });
      const data = await res.json();
      if (!res.ok || !data.synced) {
        throw new Error(data.error || "Shopify synchronization retry failed");
      }
      setReturns((prev) =>
        prev.map((r) => (r.id === returnId ? { ...r, ...data.data } : r))
      );
      toast.success("Successfully synchronized return & refund with Shopify!");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRetryingId(null);
    }
  };

  const handleUndoReturn = async (returnId: string) => {
    if (
      !confirm(
        "Remove this return record from MiBx Dispatch and restore the order status?"
      )
    ) {
      return;
    }
    setDeletingId(returnId);
    try {
      const res = await fetch(`/api/returns/${returnId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove return");
      setReturns((prev) => prev.filter((r) => r.id !== returnId));
      toast.success("Return record removed");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // Helpers to extract Returned Products, Returned Quantities, Remaining Products, and Financial info
  const formatReturnRowData = (ret: any) => {
    const order = ret.orders || {};
    const origOrderAmount = Number(
      order.original_total_price ?? order.total_price ?? ret.order_total ?? 0
    );
    const refundAmt = Number(ret.refund_amount ?? ret.returned_product_value ?? 0);
    const updatedNetAmount = Math.max(0, origOrderAmount - refundAmt);
    const financialStatusLabel = String(
      ret.shopify_financial_status ||
        order.financial_status ||
        (ret.return_type === "partial" ? "partially_refunded" : "refunded")
    )
      .replace(/_/g, " ")
      .toUpperCase();

    const rawReturnedItems = Array.isArray(ret.returned_items)
      ? ret.returned_items
      : Array.isArray(order.line_items)
        ? order.line_items
        : [];

    const returnedItemsNormalized = rawReturnedItems.map((item: any) => ({
      name: item?.name || item?.title || "Product",
      sku: item?.sku || null,
      quantity: Number(item?.quantity ?? item?.return_quantity ?? 1),
      price: Number(item?.price ?? 0),
    }));

    const totalReturnedQty =
      Number(ret.returned_quantity) > 0
        ? Number(ret.returned_quantity)
        : returnedItemsNormalized.reduce((s: number, i: any) => s + i.quantity, 0);

    // Compute remaining products for Partial Return
    let remainingProductsList: Array<{
      name: string;
      sku: string | null;
      remainingQty: number;
      originalQty: number;
    }> = [];

    if (Array.isArray(ret.remaining_items) && ret.remaining_items.length > 0) {
      remainingProductsList = ret.remaining_items
        .filter((ri: any) => Number(ri?.remaining_quantity ?? 0) > 0)
        .map((ri: any) => ({
          name: ri.name || ri.title || "Product",
          sku: ri.sku || null,
          remainingQty: Number(ri.remaining_quantity || 0),
          originalQty: Number(ri.original_quantity || ri.remaining_quantity || 1),
        }));
    } else if (Array.isArray(order.line_items)) {
      remainingProductsList = order.line_items
        .map((li: any) => {
          const origQty = Number(li?.original_quantity ?? li?.quantity ?? 1);
          const matchedRet = returnedItemsNormalized.find(
            (ri: any) =>
              (ri.sku && li.sku && ri.sku === li.sku) ||
              ri.name.toLowerCase().includes(String(li.title || li.name || "").toLowerCase())
          );
          const retQty = matchedRet ? matchedRet.quantity : 0;
          const remQty = Math.max(0, origQty - retQty);
          return {
            name: li?.name || li?.title || "Product",
            sku: li?.sku || null,
            remainingQty: remQty,
            originalQty: origQty,
          };
        })
        .filter((item: any) => item.remainingQty > 0);
    }

    return {
      orderId: order.id || ret.order_id,
      orderNumber: order.shopify_order_name || `#${String(ret.order_id).slice(0, 6)}`,
      customerName: order.customer_name || "Guest Customer",
      customerPhone: order.customer_phone || "—",
      origOrderAmount,
      refundAmt,
      updatedNetAmount,
      financialStatusLabel,
      returnedItemsNormalized,
      totalReturnedQty,
      remainingProductsList,
      returnDate: ret.returned_at
        ? new Date(ret.returned_at).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
        : "—",
      syncStatus: ret.shopify_sync_status || "synced",
      syncError: ret.shopify_sync_error || null,
      shopifyReturnId: ret.shopify_return_id || null,
      shopifyRefundId: ret.shopify_refund_id || null,
    };
  };

  return (
    <div className="space-y-6 animate-fade-in pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <RotateCcw className="w-6 h-6 text-rose-400" />
            Returns Management
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Simplified Partial Return & Full Return system fully synchronized with Shopify
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/api/reports/comprehensive?format=csv&section=returns&period=all"
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors border border-zinc-800"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            Export Returns CSV
          </a>
        </div>
      </div>

      {/* Section 9: Simple Return Reporting Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div
          onClick={() => setFilter("partial")}
          className={`cursor-pointer rounded-2xl p-4 border transition-all ${
            filter === "partial"
              ? "bg-amber-500/15 border-amber-500/40 ring-1 ring-amber-500/30"
              : "bg-zinc-900/90 border-zinc-800 hover:border-amber-500/30"
          }`}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
            Total Partial Returns
          </span>
          <p className="text-2xl font-bold text-white mt-1.5 flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            {reportStats.totalPartialReturns}
          </p>
        </div>

        <div
          onClick={() => setFilter("full")}
          className={`cursor-pointer rounded-2xl p-4 border transition-all ${
            filter === "full"
              ? "bg-rose-500/15 border-rose-500/40 ring-1 ring-rose-500/30"
              : "bg-zinc-900/90 border-zinc-800 hover:border-rose-500/30"
          }`}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-400">
            Total Full Returns
          </span>
          <p className="text-2xl font-bold text-white mt-1.5 flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-rose-400" />
            {reportStats.totalFullReturns}
          </p>
        </div>

        <div
          onClick={() => setFilter("all")}
          className={`cursor-pointer rounded-2xl p-4 border transition-all ${
            filter === "all"
              ? "bg-indigo-500/15 border-indigo-500/40 ring-1 ring-indigo-500/30"
              : "bg-zinc-900/90 border-zinc-800 hover:border-indigo-500/30"
          }`}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
            Total Returned Orders
          </span>
          <p className="text-2xl font-bold text-white mt-1.5 flex items-center gap-2">
            <Package className="w-4 h-4 text-indigo-400" />
            {reportStats.totalReturnedOrders}
          </p>
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
            Total Refunded Amount
          </span>
          <p className="text-2xl font-bold text-white mt-1.5 flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-emerald-400" />৳
            {reportStats.totalRefundedAmount.toLocaleString()}
          </p>
        </div>

        <div className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-4 col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Returned Product Quantities
          </span>
          <p className="text-2xl font-bold text-white mt-1.5 flex items-center gap-2">
            <Package className="w-4 h-4 text-zinc-400" />
            {reportStats.totalReturnedProductQuantities} pcs
          </p>
        </div>
      </div>

      {/* Search & Filter Bar (Order Number, Phone Number, Return Type, Date Range) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search by Order Number or Customer Phone Number */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Shopify Order Number (e.g. #1042) or Customer Phone Number..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-rose-500"
          />
        </div>

        {/* Date Range Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5">
            <Calendar className="w-3.5 h-3.5 text-zinc-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none"
              title="Start Date"
            />
            <span className="text-zinc-600 text-xs">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none"
              title="End Date"
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
                className="text-[11px] text-rose-400 hover:underline ml-1"
              >
                Clear
              </button>
            )}
          </div>

          {/* Return Type Filter Pills */}
          <div className="flex items-center bg-zinc-950 border border-zinc-800 rounded-xl p-1 gap-1">
            {[
              { key: "all", label: "All Returns" },
              { key: "partial", label: "Partial Return" },
              { key: "full", label: "Full Return" },
              ...(reportStats.syncFailedCount > 0
                ? [{ key: "sync_failed", label: `Sync Failed (${reportStats.syncFailedCount})` }]
                : []),
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  filter === tab.key
                    ? tab.key === "partial"
                      ? "bg-amber-500 text-zinc-950"
                      : tab.key === "full"
                        ? "bg-rose-500 text-white"
                        : "bg-zinc-800 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CATEGORY 1: PARTIAL RETURN */}
      {(filter === "all" || filter === "partial" || filter === "sync_failed") && (
        <section className="bg-zinc-900 border border-amber-500/25 rounded-2xl overflow-hidden shadow-lg">
          <div className="px-5 py-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold uppercase tracking-wider">
                PARTIAL RETURN
              </span>
              <span className="text-xs text-zinc-300">
                Customer returned some products/quantities while keeping the remaining items
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-amber-300">
              {partialReturnsList.length} record(s)
            </span>
          </div>

          {partialReturnsList.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              No Partial Returns found matching your current filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400 bg-zinc-950/60">
                    <th className="py-3 px-4">Order Number</th>
                    <th className="py-3 px-4">Customer & Phone</th>
                    <th className="py-3 px-4">Returned Products</th>
                    <th className="py-3 px-4 text-center">Returned Qty</th>
                    <th className="py-3 px-4">Remaining Products Kept</th>
                    <th className="py-3 px-4 text-right">Original Amount</th>
                    <th className="py-3 px-4 text-right">Updated Shopify Financials</th>
                    <th className="py-3 px-4">Return Date</th>
                    <th className="py-3 px-4 text-right">Shopify Sync Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 text-xs">
                  {partialReturnsList.map((ret) => {
                    const row = formatReturnRowData(ret);
                    return (
                      <tr
                        key={ret.id}
                        className="hover:bg-zinc-800/30 transition-colors align-top"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-white whitespace-nowrap">
                          <Link
                            href={`/orders/${row.orderId}`}
                            className="hover:text-amber-400 inline-flex items-center gap-1"
                          >
                            {row.orderNumber}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </Link>
                          <div className="mt-1">
                            <span className="inline-block px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold">
                              Partial Return
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-zinc-200">{row.customerName}</p>
                          <p className="text-zinc-400 font-mono mt-0.5">{row.customerPhone}</p>
                        </td>

                        <td className="py-3.5 px-4 max-w-xs">
                          <div className="space-y-1">
                            {row.returnedItemsNormalized.map((item: any, idx: number) => (
                              <div key={idx} className="text-zinc-200">
                                <span className="font-medium">{item.name}</span>
                                {item.sku && (
                                  <span className="text-zinc-500 font-mono ml-1">
                                    [{item.sku}]
                                  </span>
                                )}
                                <span className="text-rose-400 font-semibold ml-1.5">
                                  (×{item.quantity})
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-300 font-mono font-bold">
                            {row.totalReturnedQty} pcs
                          </span>
                        </td>

                        <td className="py-3.5 px-4 max-w-xs">
                          {row.remainingProductsList.length === 0 ? (
                            <span className="text-zinc-500 italic">
                              All remaining items returned later
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {row.remainingProductsList.map((rem, idx) => (
                                <div key={idx} className="text-emerald-300">
                                  <span className="font-medium">{rem.name}</span>{" "}
                                  <span className="font-mono font-bold">
                                    ({rem.remainingQty} kept)
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono text-zinc-200 whitespace-nowrap">
                          ৳{row.origOrderAmount.toLocaleString()}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="font-mono text-rose-400 font-semibold">
                            Refund: ৳{row.refundAmt.toLocaleString()}
                          </div>
                          <div className="font-mono text-emerald-400 font-bold mt-0.5">
                            Net Kept: ৳{row.updatedNetAmount.toLocaleString()}
                          </div>
                          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                            {row.financialStatusLabel}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-zinc-300 whitespace-nowrap">
                          {row.returnDate}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end gap-1.5">
                            {row.syncStatus === "failed" ? (
                              <>
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 text-[11px] font-bold"
                                  title={row.syncError || "Shopify synchronization failed"}
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  Sync Failed
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRetryShopifySync(ret.id)}
                                  disabled={retryingId === ret.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[11px] transition-colors"
                                >
                                  <RefreshCw
                                    className={`w-3 h-3 ${
                                      retryingId === ret.id ? "animate-spin" : ""
                                    }`}
                                  />
                                  Retry Sync
                                </button>
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold">
                                <CheckCircle2 className="w-3 h-3" />
                                Synced with Shopify
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleUndoReturn(ret.id)}
                              disabled={deletingId === ret.id}
                              className="text-[11px] text-zinc-500 hover:text-rose-400 inline-flex items-center gap-1 mt-0.5"
                              title="Remove return record"
                            >
                              <Trash2 className="w-3 h-3" />
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* CATEGORY 2: FULL RETURN */}
      {(filter === "all" || filter === "full" || filter === "sync_failed") && (
        <section className="bg-zinc-900 border border-rose-500/25 rounded-2xl overflow-hidden shadow-lg">
          <div className="px-5 py-4 bg-rose-500/10 border-b border-rose-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold uppercase tracking-wider">
                FULL RETURN
              </span>
              <span className="text-xs text-zinc-300">
                Customer returned the entire order (all products and quantities)
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-rose-300">
              {fullReturnsList.length} record(s)
            </span>
          </div>

          {fullReturnsList.length === 0 ? (
            <div className="p-8 text-center text-sm text-zinc-500">
              No Full Returns found matching your current filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400 bg-zinc-950/60">
                    <th className="py-3 px-4">Order Number</th>
                    <th className="py-3 px-4">Customer & Phone</th>
                    <th className="py-3 px-4">All Returned Products</th>
                    <th className="py-3 px-4 text-right">Original Order Amount</th>
                    <th className="py-3 px-4 text-right">Updated Shopify Financials</th>
                    <th className="py-3 px-4">Return Date</th>
                    <th className="py-3 px-4 text-right">Shopify Sync Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70 text-xs">
                  {fullReturnsList.map((ret) => {
                    const row = formatReturnRowData(ret);
                    return (
                      <tr
                        key={ret.id}
                        className="hover:bg-zinc-800/30 transition-colors align-top"
                      >
                        <td className="py-3.5 px-4 font-mono font-bold text-white whitespace-nowrap">
                          <Link
                            href={`/orders/${row.orderId}`}
                            className="hover:text-rose-400 inline-flex items-center gap-1"
                          >
                            {row.orderNumber}
                            <ExternalLink className="w-3 h-3 opacity-60" />
                          </Link>
                          <div className="mt-1">
                            <span className="inline-block px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-semibold">
                              Full Return
                            </span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-zinc-200">{row.customerName}</p>
                          <p className="text-zinc-400 font-mono mt-0.5">{row.customerPhone}</p>
                        </td>

                        <td className="py-3.5 px-4 max-w-md">
                          <div className="space-y-1">
                            {row.returnedItemsNormalized.map((item: any, idx: number) => (
                              <div key={idx} className="text-zinc-200">
                                <span className="font-medium">{item.name}</span>
                                {item.sku && (
                                  <span className="text-zinc-500 font-mono ml-1">
                                    [{item.sku}]
                                  </span>
                                )}
                                <span className="text-rose-400 font-semibold ml-1.5">
                                  (×{item.quantity})
                                </span>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono text-zinc-200 whitespace-nowrap">
                          ৳{row.origOrderAmount.toLocaleString()}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="font-mono text-rose-400 font-semibold">
                            Refunded: ৳{row.refundAmt.toLocaleString()}
                          </div>
                          <div className="font-mono text-zinc-400 mt-0.5">
                            Net Order: ৳0
                          </div>
                          <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                            {row.financialStatusLabel}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-zinc-300 whitespace-nowrap">
                          {row.returnDate}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="flex flex-col items-end gap-1.5">
                            {row.syncStatus === "failed" ? (
                              <>
                                <span
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 text-[11px] font-bold"
                                  title={row.syncError || "Shopify synchronization failed"}
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  Sync Failed
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleRetryShopifySync(ret.id)}
                                  disabled={retryingId === ret.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[11px] transition-colors"
                                >
                                  <RefreshCw
                                    className={`w-3 h-3 ${
                                      retryingId === ret.id ? "animate-spin" : ""
                                    }`}
                                  />
                                  Retry Sync
                                </button>
                              </>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold">
                                <CheckCircle2 className="w-3 h-3" />
                                Synced with Shopify
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => handleUndoReturn(ret.id)}
                              disabled={deletingId === ret.id}
                              className="text-[11px] text-zinc-500 hover:text-rose-400 inline-flex items-center gap-1 mt-0.5"
                              title="Remove return record"
                            >
                              <Trash2 className="w-3 h-3" />
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
