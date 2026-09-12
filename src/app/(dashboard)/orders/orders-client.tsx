"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Search, Filter, ChevronLeft, ChevronRight, ChevronDown,
  Truck, Package, X, CheckCircle, PauseCircle, AlertCircle, Archive, ArchiveRestore, Copy, Check, MessageSquare, ShieldCheck, List, Loader2, RotateCcw, UploadCloud
} from "lucide-react";
import { StatusBadge, ShopifyFinancialBadge, ShopifyFulfillmentBadge } from "@/components/ui/status-badge";
import { getOrderDisplayStatus } from "@/lib/order-status";
import { DispatchModal } from "@/components/orders/dispatch-modal";
import { BulkDispatchModal } from "@/components/orders/bulk-dispatch-modal";
import { SendSMSModal } from "@/components/orders/send-sms-modal";
import { ReturnModal } from "@/components/orders/return-modal";
import { DeliverModal } from "@/components/orders/deliver-modal";
import { ReportFraudModal } from "@/components/modals/report-fraud-modal";
import { FraudDetailsModal } from "@/components/modals/fraud-details-modal";
import { OrderTimelineModal } from "@/components/orders/order-timeline-modal";
import { BulkImportDeliveriesModal } from "@/components/orders/bulk-import-deliveries-modal";
import { DeliveredReportingHeader, DeliveredStats } from "@/components/orders/delivered-reporting-header";
import type { Order, OrderStatus } from "@/types/database";
import { analyzeCustomerRisk } from "@/lib/risk-analytics";

const STATUS_FILTERS = [
  { value: "all", label: "Pending Actions" },
  { value: "preparing", label: "Preparing" },
  { value: "hold", label: "On Hold" },
  { value: "dispatched", label: "Dispatched" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "returned", label: "Returned" },
  { value: "everything", label: "Everything" },
  { value: "archived", label: "Removed" },
];

interface OrdersClientProps {
  orders: Order[];
  total: number;
  inProgressCount?: number;
  preparingCount?: number;
  dispatchedCount?: number;
  onHoldCount?: number;
  cancelledCount?: number;
  page: number;
  pageSize: number;
  currentStatus?: string;
  currentSearch?: string;
  pathaoStoreId?: number | null;
  deliveredStats?: DeliveredStats | null;
}

export function OrdersClient({
  orders,
  total,
  inProgressCount = 0,
  preparingCount = 0,
  dispatchedCount = 0,
  onHoldCount = 0,
  cancelledCount = 0,
  pageSize,
  currentStatus,
  currentSearch,
  pathaoStoreId,
  deliveredStats,
}: OrdersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const effectiveStatus = searchParams?.get("status") || currentStatus;
  
  // State for Infinite Scroll
  const [ordersList, setOrdersList] = useState<Order[]>(orders);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = ordersList.length < total;
  const observerTarget = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState(currentSearch || "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [smsOrder, setSmsOrder] = useState<Order | null>(null);
  const [fraudOrder, setFraudOrder] = useState<Order | null>(null);
  const [viewFraudOrder, setViewFraudOrder] = useState<Order | null>(null);
  const [timelineOrderId, setTimelineOrderId] = useState<string | null>(null);
  const [isCheckingFraud, setIsCheckingFraud] = useState(false);
  const [isLoadingAllIds, setIsLoadingAllIds] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Reset list when server-provided orders change (e.g., search/filter changed)
  useEffect(() => {
    setOrdersList(orders);
    setPage(1);
  }, [orders]);

  // Supabase Realtime Listener for instant updates
  useEffect(() => {
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      
      const channelName = `orders-realtime-${Date.now()}-${Math.random()}`;
      const channel = supabase
        .channel(channelName)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
          const newOrder = payload.new as Order;
          setOrdersList((prev) => {
            // Prevent duplicates
            if (prev.some((o) => o.id === newOrder.id)) return prev;
            
            // Optionally filter by effectiveStatus
            const resolvedNewStatus = getOrderDisplayStatus(newOrder);
            const matchesFilter =
              !effectiveStatus ||
              effectiveStatus === "all" ||
              resolvedNewStatus === effectiveStatus ||
              (effectiveStatus === "hold" && resolvedNewStatus === "hold") ||
              (effectiveStatus === "on_hold" && resolvedNewStatus === "hold") ||
              (effectiveStatus === "preparing" && resolvedNewStatus === "preparing") ||
              (effectiveStatus === "in_progress" && resolvedNewStatus === "preparing");

            if (!matchesFilter) {
              return prev;
            }
            
            toast.success(`New order synced instantly: ${newOrder.shopify_order_name || 'Unknown'}`);
            return [newOrder, ...prev];
          });
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
          const updatedOrder = payload.new as Order;
          setOrdersList((prev) => {
            return prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
          });
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    });
  }, [effectiveStatus]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (effectiveStatus && effectiveStatus !== "all") params.set("status", effectiveStatus);
      if (currentSearch) params.set("search", currentSearch);
      params.set("page", (page + 1).toString());
      params.set("pageSize", pageSize.toString());

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");

      const { orders: fetchedOrders } = await res.json();
      if (fetchedOrders && fetchedOrders.length > 0) {
        setOrdersList((prev) => {
          const newOrders = fetchedOrders.filter((o: Order) => !prev.some((p) => p.id === o.id));
          return [...prev, ...newOrders];
        });
        setPage((p) => p + 1);
      } else {
        // If no orders returned, we have reached the end
        setPage((p) => p + 1); // Or better: we could introduce a piece of state to force hasMore to false
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load more orders");
    } finally {
      setLoadingMore(false);
    }
  }, [page, loadingMore, hasMore, effectiveStatus, currentSearch, pageSize]);

  const loadMoreRef = useRef(loadMore);
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRef.current();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(() => {
      const params = new URLSearchParams();
      if (effectiveStatus && effectiveStatus !== "all") params.set("status", effectiveStatus);
      if (search) params.set("search", search);
      router.push(`/orders?${params.toString()}`);
    });
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      if (search !== (currentSearch || "")) {
        startTransition(() => {
          const params = new URLSearchParams();
          if (effectiveStatus && effectiveStatus !== "all") params.set("status", effectiveStatus);
          if (search) params.set("search", search);
          router.push(`/orders?${params.toString()}`);
        });
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [search, effectiveStatus, currentSearch, router]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = async (forceSelectAll = false) => {
    if (selected.size > 0 && !forceSelectAll) {
      setSelected(new Set());
      return;
    }

    if (total <= ordersList.length && !forceSelectAll) {
      if (selected.size === ordersList.length) {
        setSelected(new Set());
      } else {
        setSelected(new Set(ordersList.map((o) => o.id)));
      }
      return;
    }

    setIsLoadingAllIds(true);
    try {
      const params = new URLSearchParams();
      params.set("idsOnly", "true");
      if (effectiveStatus && effectiveStatus !== "all") params.set("status", effectiveStatus);
      if (search) params.set("search", search);

      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch order IDs");

      setSelected(new Set(data.ids));
      toast.success(`Selected all ${data.total} orders`);
    } catch (err: any) {
      toast.error(err.message || "Failed to select all orders");
      setSelected(new Set(ordersList.map((o) => o.id)));
    } finally {
      setIsLoadingAllIds(false);
    }
  };

  const updateSingleStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Order marked as ${status}`);
      router.refresh();
      // Update local state optimistically
      setOrdersList(prev => prev.map(o => o.id === orderId ? { ...o, internal_status: status } : o));
    } catch {
      toast.error("Failed to update status");
    }
  };

  const toggleArchive = async (orderId: string, is_archived: boolean) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_archived }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(is_archived ? "Order removed" : "Order restored");
      router.refresh();
      setOrdersList(prev => prev.filter(o => o.id !== orderId));
    } catch {
      toast.error("Failed to update archive status");
    }
  };

  const bulkUpdateStatus = async (status: OrderStatus) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/orders/${id}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          })
        )
      );
      toast.success(`${ids.length} orders updated to ${status}`);
      setSelected(new Set());
      router.refresh();
      setOrdersList(prev => prev.map(o => ids.includes(o.id) ? { ...o, internal_status: status } : o));
    } catch {
      toast.error("Bulk update failed");
    }
  };

  const bulkArchive = async (is_archived: boolean) => {
    if (selected.size === 0) return;
    const ids = Array.from(selected);
    try {
      await Promise.all(
        ids.map((id) =>
          fetch(`/api/orders/${id}/archive`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_archived }),
          })
        )
      );
      toast.success(`${ids.length} orders ${is_archived ? 'archived' : 'restored'}`);
      setSelected(new Set());
      router.refresh();
      if (is_archived) {
        setOrdersList(prev => prev.filter(o => !ids.includes(o.id)));
      }
    } catch {
      toast.error("Bulk archive failed");
    }
  };

  const cancelReturn = async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    const confirmMsg = orderIds.length === 1 
      ? "Mark this order as Unreturned? It will remove the return record and restore the order to its previous status." 
      : `Mark ${orderIds.length} orders as Unreturned? It will remove the return records and restore the orders to their previous status.`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/returns/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update orders");

      toast.success(`Marked ${data.processed} order(s) as Unreturned`);
      setSelected(new Set());
      router.refresh();
      // Optimistically update status to dispatched if consignment/dispatch exists, else pending
      setOrdersList(prev => prev.map(o => {
        if (!orderIds.includes(o.id)) return o;
        const oldStatus = o.pathao_consignment_id ? "dispatched" : "pending";
        return { ...o, internal_status: oldStatus, return_delivery_fee: 0, returned_at: null, return_reason: null };
      }));
    } catch (err: any) {
      toast.error(err.message || "Failed to update orders");
    }
  };

  const cancelDelivery = async (orderIds: string[]) => {
    if (orderIds.length === 0) return;
    const confirmMsg = orderIds.length === 1 
      ? "Mark this order as Undelivered? It will restore the order to its previous status." 
      : `Mark ${orderIds.length} orders as Undelivered? It will restore the orders to their previous status.`;
    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/deliveries/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update orders");

      toast.success(`Marked ${data.processed} order(s) as Undelivered`);
      setSelected(new Set());
      router.refresh();
      // Optimistically update status
      setOrdersList(prev => prev.map(o => {
        if (!orderIds.includes(o.id)) return o;
        const oldStatus = o.pathao_consignment_id ? "dispatched" : "pending";
        return { ...o, internal_status: oldStatus, delivered_at: null, pathao_delivery_status: null };
      }));
    } catch (err: any) {
      toast.error(err.message || "Failed to update orders");
    }
  };

  const manualFraudCheck = async (orderId: string) => {
    setIsCheckingFraud(true);
    const toastId = toast.loading("Checking FraudSpy...");
    try {
      const res = await fetch(`/api/orders/${orderId}/fraud-check`, {
        method: "POST",
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || "Failed to check fraud status");
      
      toast.success("Fraud check completed!", { id: toastId });
      
      const updatedOrder = {
        fraud_status: data.fraud_status, 
        fraud_score: data.fraud_score,
        fraud_data: data.data 
      };

      // Update local state with the new status/score
      setOrdersList(prev => prev.map(o => o.id === orderId ? { ...o, ...updatedOrder } : o));
      
      // Update the modal if it's currently open
      setViewFraudOrder(prev => prev?.id === orderId ? { ...prev, ...updatedOrder } as Order : prev);
      
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    } finally {
      setIsCheckingFraud(false);
    }
  };

  const [bulkDispatchModalOpen, setBulkDispatchModalOpen] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [deliverModalOpen, setDeliverModalOpen] = useState(false);
  const [bulkImportDeliveriesOpen, setBulkImportDeliveriesOpen] = useState(false);
  const [isCourierSyncing, setIsCourierSyncing] = useState(false);
  const [courierMenuOpen, setCourierMenuOpen] = useState(false);

  const handleCourierSync = async (days: number | "all" = 7) => {
    setCourierMenuOpen(false);
    setIsCourierSyncing(true);
    const toastId = toast.loading(
      days === "all"
        ? "Scanning all Pathao courier dispatches (Full History)..."
        : "Scanning courier orders for the last 7 days..."
    );
    try {
      const res = await fetch(`/api/pathao/sync-status?days=${days}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to scan courier status");

      toast.success(
        `Courier Sync Complete: Checked ${data.checked || data.totalChecked} parcels (${days === "all" ? "All History" : "Last 7 Days"}), updated ${data.updated || data.updatedCount} orders.`,
        { id: toastId, duration: 5000 }
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to sync courier status", { id: toastId });
    } finally {
      setIsCourierSyncing(false);
    }
  };

  const singleOrder = selected.size === 1 ? ordersList.find(o => o.id === Array.from(selected)[0]) : null;
  const singleLineItems = singleOrder ? ((singleOrder.line_items as any[]) || []) : [];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Delivered Reporting Header or Consolidated Status Bar */}
      {effectiveStatus === "delivered" ? (
        <DeliveredReportingHeader
          stats={deliveredStats || null}
          onOpenImportModal={() => setBulkImportDeliveriesOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 sm:p-4 flex flex-col justify-center items-center">
            <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">Dispatched</div>
            <div className="text-xl sm:text-2xl font-semibold text-indigo-400">{dispatchedCount}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 sm:p-4 flex flex-col justify-center items-center">
            <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">Preparing</div>
            <div className="text-xl sm:text-2xl font-semibold text-amber-400">{preparingCount || inProgressCount}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 sm:p-4 flex flex-col justify-center items-center">
            <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">On Hold</div>
            <div className="text-xl sm:text-2xl font-semibold text-orange-400">{onHoldCount}</div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 sm:p-4 flex flex-col justify-center items-center">
            <div className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-1">Cancelled</div>
            <div className="text-xl sm:text-2xl font-semibold text-rose-400">{cancelledCount}</div>
          </div>
        </div>
      )}

      {/* Search + Filter */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <form onSubmit={handleSearch} className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search orders, customers, phones..."
              className="w-full pl-9 pr-10 py-2 sm:py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm
                        text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500
                        focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {isPending && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 animate-spin" />
            )}
          </form>
          <div className="flex items-center gap-2 shrink-0">
            <button 
              type="button" 
              onClick={() => selectAll()} 
              disabled={isLoadingAllIds}
              className="flex-1 sm:flex-initial px-3.5 py-2 sm:py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors whitespace-nowrap flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoadingAllIds ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  Selecting all {total}...
                </>
              ) : selected.size > 0 ? (
                `Deselect All (${selected.size})`
              ) : (
                `Select All (${total})`
              )}
            </button>
            {/* Sync Courier (7d or All) Dropdown */}
            <div className="relative flex items-center flex-1 sm:flex-initial">
              <button
                type="button"
                onClick={() => handleCourierSync(7)}
                disabled={isCourierSyncing}
                className="flex-1 sm:flex-initial px-3 py-2 sm:py-2.5 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-l-xl text-xs sm:text-sm font-medium hover:bg-blue-600/30 transition-colors whitespace-nowrap flex items-center justify-center gap-1.5 disabled:opacity-50"
                title="Scan Pathao courier status for all orders in the last 7 days and update DB + Shopify"
              >
                <RotateCcw className={`w-3.5 h-3.5 shrink-0 ${isCourierSyncing ? "animate-spin" : ""}`} />
                <span>{isCourierSyncing ? "Syncing..." : "Sync Courier (7d)"}</span>
              </button>
              <button
                type="button"
                onClick={() => setCourierMenuOpen(!courierMenuOpen)}
                disabled={isCourierSyncing}
                className="px-2 py-2 sm:py-2.5 bg-blue-600/20 text-blue-400 border-t border-r border-b border-l-0 border-blue-500/30 rounded-r-xl text-xs sm:text-sm font-medium hover:bg-blue-600/30 transition-colors disabled:opacity-50"
                title="Options: 7 Days or Complete Scan"
              >
                <ChevronDown size={14} />
              </button>

              {courierMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-60 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Courier Scan Range
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCourierSync(7)}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <div className="font-medium text-blue-400">Scan Last 7 Days (Default)</div>
                    <div className="text-[10px] text-zinc-400">Fast scan of recent deliveries</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCourierSync("all")}
                    className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors"
                  >
                    <div className="font-medium text-indigo-400">Complete Scan (All Dispatches)</div>
                    <div className="text-[10px] text-zinc-400">Scan all past orders on Pathao</div>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setBulkImportDeliveriesOpen(true)}
              className="flex-1 sm:flex-initial px-3.5 py-2 sm:py-2.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-xl text-xs sm:text-sm font-medium hover:bg-emerald-600/30 transition-colors whitespace-nowrap flex items-center justify-center gap-1.5"
            >
              <UploadCloud className="w-4 h-4 shrink-0" />
              <span>Import Deliveries</span>
            </button>
          </div>
        </div>

        {/* Helper Banner when only loaded orders were selected and more exist */}
        {selected.size === ordersList.length && total > ordersList.length && (
          <div className="bg-indigo-500/10 border border-indigo-500/25 rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-indigo-300 animate-in fade-in">
            <span>All <strong>{ordersList.length}</strong> loaded orders are selected.</span>
            <button
              onClick={() => selectAll(true)}
              disabled={isLoadingAllIds}
              className="underline hover:text-white font-semibold ml-2 disabled:opacity-50"
            >
              {isLoadingAllIds ? "Selecting..." : `Select all ${total} orders matching current filter`}
            </button>
          </div>
        )}

        {/* Status filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {STATUS_FILTERS.map((f) => {
            const isSelected =
              (f.value === "all" && (!effectiveStatus || effectiveStatus === "all" || effectiveStatus === "pending" || effectiveStatus === "unfulfilled")) ||
              (f.value === "preparing" && (effectiveStatus === "preparing" || effectiveStatus === "in_progress")) ||
              (f.value === "hold" && (effectiveStatus === "hold" || effectiveStatus === "on_hold")) ||
              (effectiveStatus === f.value);

            return (
              <button
                key={f.value}
                onClick={() => {
                  startTransition(() => {
                    const params = new URLSearchParams();
                    if (f.value !== "all") params.set("status", f.value);
                    if (search) params.set("search", search);
                    router.push(`/orders?${params.toString()}`);
                  });
                }}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${
                    isSelected
                      ? "bg-indigo-500 text-white"
                      : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }
                `}
              >
                {f.label}
                {f.value === "preparing" && (preparingCount > 0 || inProgressCount > 0) && (
                  <span className="ml-1 opacity-70 text-xs">({preparingCount || inProgressCount})</span>
                )}
                {f.value === "hold" && onHoldCount > 0 && (
                  <span className="ml-1 opacity-70 text-xs">({onHoldCount})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bulk Actions Floating Bar */}
      {selected.size > 0 && (
          <div className="sticky top-2 z-50 w-full 
                          bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-2xl shadow-2xl p-3
                          flex flex-col lg:flex-row items-center justify-between gap-3 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3 w-full lg:w-auto shrink-0">
              <span className="text-sm font-semibold text-zinc-100 bg-indigo-500/20 text-indigo-400 px-3 py-1.5 rounded-lg border border-indigo-500/20">
                {selected.size} selected
              </span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-zinc-400 hover:text-zinc-200 underline underline-offset-2"
              >
                Clear
              </button>
            </div>
            
            <div className="flex flex-wrap items-center justify-center lg:justify-end gap-2 w-full">
              {/* Single Order Actions */}
              {singleOrder && (
                <>
                  {/* WhatsApp */}
                  {singleOrder.customer_phone && !singleOrder.is_archived && (
                    <button
                      onClick={() => {
                        const d = singleOrder.customer_phone!.replace(/[^0-9]/g, '');
                        const formattedPhone = d.startsWith('880') ? d : d.startsWith('0') ? `88${d}` : `880${d}`;
                        const text = `আসসালামু আলাইকুম! আপনার ${singleOrder.shopify_order_name} অর্ডারটি পেন্ডিং আছে।\n\n${singleLineItems
                          .map((item: any) => `- ${item.title}${item.variant_title ? ` (${item.variant_title})` : ''} x ${item.quantity}`)
                          .join('\n')}\n\nমোট বিল: ৳${Number(singleOrder.total_price).toLocaleString()}\n\nআপনি কি অর্ডারটি কনফার্ম করতে চান?`;
                        const encodedText = encodeURIComponent(text);
                        
                        const ua = navigator.userAgent.toLowerCase();
                        const isAndroid = ua.includes('android');
                        const isIOS = /ipad|iphone|ipod/.test(ua) && !(window as any).MSStream;
                        
                        if (isAndroid) {
                          window.location.href = `intent://send/?phone=${formattedPhone}&text=${encodedText}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`;
                        } else if (isIOS) {
                          window.location.href = `whatsapp://send?phone=${formattedPhone}&text=${encodedText}`;
                        } else {
                          window.open(`https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`, '_blank');
                        }
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-green-600/15 text-green-400
                                border border-green-600/20 hover:bg-green-600/25 transition-colors"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.487-1.761-1.66-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
                      </svg>
                      WhatsApp
                    </button>
                  )}
                  
                  {singleOrder.customer_phone && !singleOrder.is_archived && (
                    <button onClick={() => setSmsOrder(singleOrder)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-orange-600/15 text-orange-400 border border-orange-600/20 hover:bg-orange-600/25 transition-colors">
                      <MessageSquare size={14} /> SMS
                    </button>
                  )}

                  {singleOrder.customer_phone && !singleOrder.is_archived && (
                    <button onClick={() => setFraudOrder(singleOrder)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-red-600/15 text-red-400 border border-red-600/20 hover:bg-red-600/25 transition-colors">
                      <AlertCircle size={14} /> Report
                    </button>
                  )}

                  {singleOrder.customer_phone && !singleOrder.is_archived && (
                    <button onClick={() => setViewFraudOrder(singleOrder)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors">
                      <ShieldCheck size={14} /> Check Fraud
                    </button>
                  )}

                  <button onClick={() => setTimelineOrderId(singleOrder.id)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-indigo-600/15 text-indigo-300 border border-indigo-600/20 hover:bg-indigo-600/25 transition-colors">
                    <List size={14} /> Timeline
                  </button>
                  
                  <div className="w-px h-6 bg-zinc-700 mx-1 hidden lg:block"></div>
                </>
              )}

              {/* Bulk Actions (Always show if > 0 selected) */}
              <button onClick={() => setBulkDispatchModalOpen(true)} className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-lg shadow-indigo-500/20">
                <Truck size={14} /> Dispatch
              </button>
              <button onClick={() => bulkUpdateStatus("preparing")} className="flex items-center gap-1.5 bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-amber-500/20">
                <Package size={14} /> Preparing
              </button>
              <button onClick={() => bulkUpdateStatus("hold")} className="flex items-center gap-1.5 bg-orange-500/15 text-orange-400 hover:bg-orange-500/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-orange-500/20">
                <PauseCircle size={14} /> Hold
              </button>
              <button onClick={() => bulkUpdateStatus("cancelled")} className="flex items-center gap-1.5 bg-red-500/15 text-red-400 hover:bg-red-500/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-red-500/20">
                <X size={14} /> Cancel
              </button>
              <button onClick={() => setDeliverModalOpen(true)} className="flex items-center gap-1.5 bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-emerald-500/20">
                <CheckCircle size={14} /> Deliver
              </button>
              <button onClick={() => setReturnModalOpen(true)} className="flex items-center gap-1.5 bg-rose-500/15 text-rose-400 hover:bg-rose-500/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-rose-500/20">
                <RotateCcw size={14} /> Return
              </button>

              {(() => {
                const selOrders = Array.from(selected).map(id => ordersList.find(o => o.id === id)).filter(Boolean);
                const deliveredIds = selOrders.filter(o => o?.internal_status === "delivered" || o?.delivered_at || getOrderDisplayStatus(o!) === "delivered").map(o => o!.id);
                const returnedIds = selOrders.filter(o => o?.internal_status === "returned" || o?.returned_at || (o as any)?.returns?.length > 0 || getOrderDisplayStatus(o!) === "returned").map(o => o!.id);

                return (
                  <>
                    <button
                      onClick={() => cancelDelivery(deliveredIds.length > 0 ? deliveredIds : Array.from(selected))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border whitespace-nowrap shadow-sm ${
                        deliveredIds.length > 0 
                          ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-amber-500/40" 
                          : "bg-zinc-800 text-zinc-400 hover:text-amber-300 hover:bg-zinc-700 border-zinc-700"
                      }`}
                      title="Mark selected orders as Undelivered (restores previous status)"
                    >
                      <RotateCcw size={13} /> {deliveredIds.length > 0 ? `Undelivered (${deliveredIds.length})` : "Undelivered"}
                    </button>

                    <button
                      onClick={() => cancelReturn(returnedIds.length > 0 ? returnedIds : Array.from(selected))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border whitespace-nowrap shadow-sm ${
                        returnedIds.length > 0 
                          ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border-rose-500/40" 
                          : "bg-zinc-800 text-zinc-400 hover:text-rose-300 hover:bg-zinc-700 border-zinc-700"
                      }`}
                      title="Mark selected orders as Unreturned (removes return record and restores previous status)"
                    >
                      <RotateCcw size={13} /> {returnedIds.length > 0 ? `Unreturned (${returnedIds.length})` : "Unreturned"}
                    </button>
                  </>
                );
              })()}

              <div className="w-px h-6 bg-zinc-700 mx-1 hidden sm:block"></div>
              
              <button onClick={() => bulkArchive(true)} className="flex items-center gap-1.5 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-zinc-700">
                <Archive size={14} /> Remove
              </button>
              <button onClick={() => bulkArchive(false)} className="flex items-center gap-1.5 bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-emerald-600/20">
                <ArchiveRestore size={14} /> Restore
              </button>
            </div>
          </div>
      )}

      {/* Order List */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {ordersList.map((order) => {
          const isSelected = selected.has(order.id);
          const lineItems = (order.line_items as any[]) || [];
          const isDispatchedOrCancelled = order.internal_status === "dispatched" || order.internal_status === "delivered" || order.internal_status === "returned" || order.internal_status === "cancelled";

          return (
            <div
              key={order.id}
              className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-all duration-200 flex flex-col
                ${isSelected ? "border-indigo-500 ring-1 ring-indigo-500" : "border-zinc-800 hover:border-zinc-700"}
              `}
            >
              {/* Header */}
              <div className="p-2.5 px-3 border-b border-zinc-800/50 bg-zinc-900/50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    onClick={() => toggleSelect(order.id)}
                    className={`w-5 h-5 rounded flex items-center justify-center transition-colors shrink-0
                    ${isSelected ? "bg-indigo-500 text-white" : "border-2 border-zinc-700 hover:border-zinc-500"}
                    `}
                  >
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </button>
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <h3 className="font-bold text-zinc-100 text-sm truncate">{order.shopify_order_name}</h3>
                    <StatusBadge status={getOrderDisplayStatus(order)} />
                    {(order as any).returns?.some((r: any) => r.return_type === "partial" && !r.is_verified) && (
                      <a
                        href="/returns?filter=pending_verification"
                        onClick={(e) => e.stopPropagation()}
                        className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/35 hover:bg-amber-500/30 transition-colors flex items-center gap-1 shrink-0 animate-pulse"
                        title="Partial return from Shopify awaiting admin verification & approval in Returns"
                      >
                        <AlertCircle size={10} className="text-amber-400" />
                        Needs Attention
                      </a>
                    )}
                  </div>
                </div>
                
                {/* Actions for individual order */}
                {!order.is_archived && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setDispatchOrder(order)}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-500/15 text-indigo-300 hover:bg-indigo-500/25 border border-indigo-500/25 transition-colors whitespace-nowrap"
                    >
                      <Truck size={12} /> {isDispatchedOrCancelled ? "Re-dispatch" : "Dispatch"}
                    </button>
                  </div>
                )}
              </div>

              {/* Body */}
              <div className="p-2.5 px-3 flex gap-3">
                {/* Customer Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-200 truncate">{order.customer_name || "Unknown Customer"}</p>
                    {(() => {
                      const analysis = analyzeCustomerRisk({
                        fraud_data: order.fraud_data,
                        fraud_status: order.fraud_status,
                        fraud_score: order.fraud_score,
                      });

                      if (analysis.isHighRisk) {
                        return (
                          <span 
                            onClick={() => setViewFraudOrder(order)}
                            className="px-1.5 py-0.5 text-[10px] font-bold rounded-full border bg-red-500/10 text-red-400 border-red-500/20 cursor-pointer hover:bg-red-500/20 transition-colors" 
                            title={analysis.recommendation}
                          >
                            {analysis.badgeText}
                          </span>
                        );
                      }
                      if (analysis.isMediumRisk) {
                        return (
                          <span 
                            onClick={() => setViewFraudOrder(order)}
                            className="px-1.5 py-0.5 text-[10px] font-bold rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20 cursor-pointer hover:bg-amber-500/20 transition-colors" 
                            title={analysis.recommendation}
                          >
                            {analysis.badgeText}
                          </span>
                        );
                      }
                      if (analysis.isSafe && (analysis.delivered >= 3 || analysis.total >= 3)) {
                        return (
                          <span 
                            onClick={() => setViewFraudOrder(order)}
                            className="px-1.5 py-0.5 text-[10px] font-bold rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20 transition-colors" 
                            title={analysis.recommendation}
                          >
                            {analysis.badgeText}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  
                  {order.customer_phone ? (
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-zinc-400 truncate">{order.customer_phone}</p>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(order.customer_phone!);
                          toast.success("Phone copied");
                        }}
                        className="text-zinc-600 hover:text-zinc-400 transition-colors"
                        title="Copy phone"
                      >
                        <Copy size={12} />
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600">No phone number</p>
                  )}
                  
                  {/* Shopify Badges */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {order.financial_status && (
                      <ShopifyFinancialBadge status={order.financial_status} />
                    )}
                    <ShopifyFulfillmentBadge
                      status={order.fulfillment_status || "unfulfilled"}
                      currentStatus={getOrderDisplayStatus(order)}
                    />
                  </div>

                  {/* Line Items */}
                  {lineItems.length > 0 && (
                    <div className="mt-2 space-y-0.5 bg-zinc-950/30 p-1.5 px-2 rounded-md border border-zinc-800/40">
                      {lineItems.map((item: any, idx: number) => {
                        const isRemoved = item.quantity === 0;
                        return (
                          <div key={idx} className={`flex justify-between items-start text-[11px] leading-tight ${isRemoved ? 'opacity-60' : ''}`}>
                            <span className={`text-zinc-300 pr-2 flex-1 min-w-0 break-words ${isRemoved ? 'line-through' : ''}`}>
                              {item.title}
                              {item.variant_title && item.variant_title !== 'Default Title' && (
                                <span className="text-zinc-500 ml-1">({item.variant_title})</span>
                              )}
                              {isRemoved && (
                                <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-800 text-zinc-400 no-underline">
                                  Removed
                                </span>
                              )}
                            </span>
                            <span className="text-zinc-400 font-medium whitespace-nowrap">
                              x {isRemoved ? (item.original_quantity || 0) : item.quantity}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Pathao consignment if dispatched */}
                  {order.pathao_consignment_id && (
                    <p className="text-xs text-indigo-400 mt-1">
                      📦 {order.pathao_consignment_id}
                      {order.pathao_delivery_status && (
                        <span className="ml-2 text-zinc-500">· {order.pathao_delivery_status}</span>
                      )}
                    </p>
                  )}
                </div>

                {/* Amount */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-zinc-100">৳{Number(order.total_price).toLocaleString()}</p>
                  <p className="text-[10px] text-zinc-600 mt-0.5">
                    {new Date(order.shopify_created_at || order.created_at).toLocaleDateString("en-BD", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5 border-t border-zinc-800/50 pt-2 mt-auto">
                {order.customer_phone && !order.is_archived && !isDispatchedOrCancelled && (
                  <button onClick={() => {
                    const d = order.customer_phone!.replace(/[^0-9]/g, '');
                    const formattedPhone = d.startsWith('880') ? d : d.startsWith('0') ? `88${d}` : `880${d}`;
                    const text = `আসসালামু আলাইকুম! আপনার ${order.shopify_order_name} অর্ডারটি পেন্ডিং আছে।\n\n${lineItems.map((item: any) => `- ${item.title}${item.variant_title ? ` (${item.variant_title})` : ''} x ${item.quantity}`).join('\n')}\n\nমোট বিল: ৳${Number(order.total_price).toLocaleString()}\n\nআপনি কি অর্ডারটি কনফার্ম করতে চান?`;
                    const encodedText = encodeURIComponent(text);
                    const ua = navigator.userAgent.toLowerCase();
                    if (ua.includes('android')) window.location.href = `intent://send/?phone=${formattedPhone}&text=${encodedText}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end`;
                    else if (/ipad|iphone|ipod/.test(ua) && !(window as any).MSStream) window.location.href = `whatsapp://send?phone=${formattedPhone}&text=${encodedText}`;
                    else window.open(`https://web.whatsapp.com/send?phone=${formattedPhone}&text=${encodedText}`, '_blank');
                  }} className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-green-600/15 text-green-400 border border-green-600/25 hover:bg-green-600/25 transition-colors whitespace-nowrap">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.487-1.761-1.66-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                    WhatsApp
                  </button>
                )}

                {order.customer_phone && !order.is_archived && (
                  <button onClick={() => setSmsOrder(order)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-orange-600/15 text-orange-400 border border-orange-600/25 hover:bg-orange-600/25 transition-colors whitespace-nowrap">
                    <MessageSquare size={11} /> SMS
                  </button>
                )}

                {order.customer_phone && !order.is_archived && (
                  <button onClick={() => setFraudOrder(order)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-red-600/15 text-red-400 border border-red-600/25 hover:bg-red-600/25 transition-colors whitespace-nowrap">
                    <AlertCircle size={11} /> Report
                  </button>
                )}

                {order.customer_phone && !order.is_archived && (
                  <button onClick={() => setViewFraudOrder(order)} className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-md bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 hover:text-white transition-colors whitespace-nowrap">
                    <ShieldCheck size={11} /> Check
                  </button>
                )}

                {(() => {
                  const isOrderDelivered = order.internal_status === "delivered" || Boolean(order.delivered_at) || getOrderDisplayStatus(order) === "delivered";
                  const isOrderReturned = order.internal_status === "returned" || Boolean(order.returned_at) || Boolean((order as any).returns?.length) || getOrderDisplayStatus(order) === "returned";

                  return (
                    <>
                      {isOrderDelivered && (
                        <button 
                          onClick={() => cancelDelivery([order.id])}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/35 hover:bg-amber-500/30 transition-colors whitespace-nowrap ml-auto"
                          title="Mark order as Undelivered (restores previous status)"
                        >
                          <RotateCcw size={11} /> Undelivered
                        </button>
                      )}

                      {isOrderReturned && (
                        <button 
                          onClick={() => cancelReturn([order.id])}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/35 hover:bg-rose-500/30 transition-colors whitespace-nowrap ml-auto"
                          title="Mark order as Unreturned (removes return record and restores previous status)"
                        >
                          <RotateCcw size={11} /> Unreturned
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          );
        })}
        
        {/* Loading Spinner */}
        {(loadingMore || isPending) && (
          <div className="col-span-full py-8 flex justify-center">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}
        
        {/* Intersection Target */}
        <div ref={observerTarget} className="h-4 w-full"></div>
        
        {!hasMore && ordersList.length > 0 && (
          <div className="col-span-full py-6 text-center">
            <p className="text-xs font-medium text-zinc-600 uppercase tracking-widest">End of results</p>
          </div>
        )}

        {ordersList.length === 0 && !isPending && (
          <div className="col-span-full py-16 text-center">
            <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-6 h-6 text-zinc-600" />
            </div>
            <h3 className="text-zinc-200 font-semibold text-base mb-1">No orders found</h3>
            <p className="text-sm text-zinc-500">Try adjusting your filters or search query.</p>
          </div>
        )}
      </div>

      {/* Dispatch Modal */}
      {dispatchOrder && (
        <DispatchModal
          order={dispatchOrder}
          storeId={pathaoStoreId}
          onClose={() => setDispatchOrder(null)}
          onSuccess={() => {
            if (currentStatus !== "all" && currentStatus !== "dispatched") {
              setOrdersList(prev => prev.filter(o => o.id !== dispatchOrder.id));
            } else {
              setOrdersList(prev => prev.map(o => o.id === dispatchOrder.id ? { ...o, internal_status: 'dispatched' } : o));
            }
            setDispatchOrder(null);
            router.refresh();
          }}
        />
      )}

      {/* Bulk Dispatch Modal */}
      {bulkDispatchModalOpen && (
        <BulkDispatchModal
          orderIds={Array.from(selected)}
          storeId={pathaoStoreId}
          onClose={() => setBulkDispatchModalOpen(false)}
          onSuccess={() => {
            if (currentStatus !== "all" && currentStatus !== "dispatched") {
              setOrdersList(prev => prev.filter(o => !selected.has(o.id)));
            } else {
              setOrdersList(prev => prev.map(o => selected.has(o.id) ? { ...o, internal_status: 'dispatched' } : o));
            }
            setBulkDispatchModalOpen(false);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}

      <SendSMSModal 
        isOpen={!!smsOrder} 
        onClose={() => setSmsOrder(null)} 
        order={smsOrder} 
      />

      <ReportFraudModal
        isOpen={!!fraudOrder}
        onClose={() => setFraudOrder(null)}
        order={fraudOrder}
      />
      
      <FraudDetailsModal
        order={viewFraudOrder}
        onClose={() => setViewFraudOrder(null)}
        onCheckAgain={manualFraudCheck}
        isChecking={isCheckingFraud}
      />

      <OrderTimelineModal
        orderId={timelineOrderId}
        open={!!timelineOrderId}
        onOpenChange={(open) => !open && setTimelineOrderId(null)}
      />

      {/* Return Modal */}
      {returnModalOpen && (
        <ReturnModal
          orders={Array.from(selected).map(id => ordersList.find(o => o.id === id)).filter(Boolean)}
          onClose={() => setReturnModalOpen(false)}
          onSuccess={() => {
            // Note: Optimistic UI update is trickier now because partial returns don't change internal_status.
            // But we will refresh the router, so the server component will fetch fresh data.
            setReturnModalOpen(false);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}

      {/* Deliver Modal */}
      {deliverModalOpen && (
        <DeliverModal
          orders={Array.from(selected).map(id => ordersList.find(o => o.id === id)).filter(Boolean)}
          onClose={() => setDeliverModalOpen(false)}
          onSuccess={() => {
            setDeliverModalOpen(false);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}

      {bulkImportDeliveriesOpen && (
        <BulkImportDeliveriesModal
          onClose={() => setBulkImportDeliveriesOpen(false)}
          onSuccess={() => {
            // Re-fetch or refresh
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
