"use client";

import { useState, useTransition, useCallback, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Search, Filter, ChevronLeft, ChevronRight,
  Truck, Package, X, CheckCircle, PauseCircle, AlertCircle, Archive, ArchiveRestore, Copy, Check
} from "lucide-react";
import { StatusBadge, ShopifyFinancialBadge, ShopifyFulfillmentBadge } from "@/components/ui/status-badge";
import { DispatchModal } from "@/components/orders/dispatch-modal";
import { BulkDispatchModal } from "@/components/orders/bulk-dispatch-modal";
import type { Order, OrderStatus } from "@/types/database";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "preparing", label: "Preparing" },
  { value: "dispatched", label: "Dispatched" },
  { value: "delivered", label: "Delivered" },
  { value: "hold", label: "Hold" },
  { value: "cancelled", label: "Cancelled" },
  { value: "delayed", label: "Delayed" },
  { value: "returned", label: "Returned" },
  { value: "archived", label: "Removed" },
];

interface OrdersClientProps {
  orders: Order[];
  total: number;
  page: number;
  pageSize: number;
  currentStatus?: string;
  currentSearch?: string;
  pathaoStoreId?: number | null;
}

export function OrdersClient({
  orders,
  total,
  pageSize,
  currentStatus,
  currentSearch,
  pathaoStoreId,
}: OrdersClientProps) {
  const router = useRouter();
  
  // State for Infinite Scroll
  const [ordersList, setOrdersList] = useState<Order[]>(orders);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const hasMore = ordersList.length < total;
  const observerTarget = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState(currentSearch || "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset list when server-provided orders change (e.g., search/filter changed)
  useEffect(() => {
    setOrdersList(orders);
    setPage(1);
  }, [orders]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const sp = new URLSearchParams();
      if (currentStatus && currentStatus !== "all") sp.set("status", currentStatus);
      if (currentSearch) sp.set("search", currentSearch);
      sp.set("page", String(next));
      sp.set("pageSize", String(pageSize));

      const res = await fetch(`/api/orders?${sp.toString()}`);
      if (!res.ok) throw new Error("Failed to load more");
      const data = await res.json();
      
      setOrdersList(prev => {
        // filter out potential duplicates due to concurrent edits
        const existingIds = new Set(prev.map(o => o.id));
        const newOrders = data.orders.filter((o: Order) => !existingIds.has(o.id));
        return [...prev, ...newOrders];
      });
      setPage(next);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load more orders");
    } finally {
      setLoadingMore(false);
    }
  }, [page, hasMore, loadingMore, currentStatus, currentSearch, pageSize]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 1.0 }
    );
    if (observerTarget.current) observer.observe(observerTarget.current);
    return () => observer.disconnect();
  }, [loadMore]);

  const navigate = useCallback(
    (params: Record<string, string | undefined>) => {
      const sp = new URLSearchParams();
      if (params.status && params.status !== "all") sp.set("status", params.status);
      if (params.search) sp.set("search", params.search);
      startTransition(() => {
        router.push(`/orders${sp.toString() ? `?${sp.toString()}` : ""}`);
      });
    },
    [router]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ status: currentStatus, search });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === ordersList.length) setSelected(new Set());
    else setSelected(new Set(ordersList.map((o) => o.id)));
  };

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Status updated to ${status}`);
      router.refresh();
      // Optimistically update list
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
      toast.success(is_archived ? "Order removed from dispatch" : "Order restored to dispatch");
      router.refresh();
      // Remove from list optimistically
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
      // Optimistically update
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
      toast.success(`${ids.length} orders ${is_archived ? 'removed' : 'restored'}`);
      setSelected(new Set());
      router.refresh();
      // Optimistically remove from list if archiving
      if (is_archived) {
        setOrdersList(prev => prev.filter(o => !ids.includes(o.id)));
      }
    } catch {
      toast.error("Bulk archive failed");
    }
  };

  const [bulkDispatchModalOpen, setBulkDispatchModalOpen] = useState(false);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Search + Filter */}
      <div className="space-y-3">
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search orders, customers, phones..."
            className="w-full pl-9 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm
                      text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500
                      focus:ring-1 focus:ring-indigo-500"
          />
        </form>

        {/* Status filters */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() =>
                navigate({ status: f.value, search: currentSearch })
              }
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                (currentStatus || "all") === f.value
                  ? "bg-indigo-600 border-indigo-500 text-white"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 bg-zinc-900"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-3 rounded-xl bg-indigo-600/10 border border-indigo-500/30 animate-fade-in">
          <span className="text-xs text-indigo-300 font-medium whitespace-nowrap">
            {selected.size} selected
          </span>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ml-auto">
            <button
              onClick={() => setBulkDispatchModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-500 transition-colors"
            >
              <Truck size={14} /> Bulk Dispatch
            </button>
            <button
              onClick={() => bulkUpdateStatus("preparing")}
              className="px-3 py-1.5 text-xs rounded-lg bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/30 transition-colors"
            >
              Mark Preparing
            </button>
            <button
              onClick={() => bulkUpdateStatus("hold")}
              className="px-3 py-1.5 text-xs rounded-lg bg-orange-600/20 text-orange-300 border border-orange-500/30 hover:bg-orange-600/30 transition-colors"
            >
              Hold
            </button>
            <button
              onClick={() => bulkUpdateStatus("cancelled")}
              className="px-3 py-1.5 text-xs rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => bulkArchive(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg bg-zinc-800/80 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition-colors"
            >
              <Archive size={12} /> Hide
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 ml-auto sm:ml-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Stats & Master Checkbox */}
      <div className="flex items-center justify-between text-xs text-zinc-500 bg-zinc-800/20 p-2 rounded-lg border border-zinc-800/50">
        <div className="flex items-center gap-3 px-2">
          <button
            onClick={selectAll}
            className={`w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
              selected.size === ordersList.length && ordersList.length > 0
                ? "bg-indigo-600 border-indigo-500"
                : selected.size > 0
                ? "bg-indigo-600/50 border-indigo-500"
                : "border-zinc-700 hover:border-zinc-500 bg-zinc-900"
            }`}
          >
            {selected.size === ordersList.length && ordersList.length > 0 && (
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
            )}
            {selected.size > 0 && selected.size < ordersList.length && (
              <div className="w-2 h-0.5 bg-white rounded-full" />
            )}
          </button>
          <span className="font-medium text-zinc-300 cursor-pointer select-none" onClick={selectAll}>
            Select All
          </span>
        </div>
        <span className="px-2">
          Showing {ordersList.length} of {total} orders
        </span>
      </div>

      {/* Orders list */}
      <div className="space-y-2">
        {ordersList.length === 0 && (
          <div className="text-center py-16 text-zinc-600">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No orders found</p>
            {currentSearch && (
              <button
                onClick={() => navigate({ status: currentStatus })}
                className="text-xs text-indigo-400 mt-2 hover:text-indigo-300"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {ordersList.map((order: Order) => (
          <OrderCard
            key={order.id}
            order={order}
            selected={selected.has(order.id)}
            onSelect={() => toggleSelect(order.id)}
            onStatusChange={(status) => updateStatus(order.id, status)}
            onArchiveToggle={() => toggleArchive(order.id, !order.is_archived)}
            onDispatch={() => setDispatchOrder(order)}
          />
        ))}
        
        {/* Infinite scroll observer target */}
        {hasMore && (
          <div ref={observerTarget} className="py-6 text-center text-zinc-500 text-xs">
            {loadingMore ? "Loading more orders..." : "Scroll for more"}
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
            setBulkDispatchModalOpen(false);
            setSelected(new Set());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

interface OrderCardProps {
  order: Order;
  selected: boolean;
  onSelect: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onArchiveToggle: () => void;
  onDispatch: () => void;
}

function OrderCard({ order, selected, onSelect, onStatusChange, onArchiveToggle, onDispatch }: OrderCardProps) {
  const lineItems = (order.line_items as any[]) || [];
  const isDispatched = !!order.pathao_consignment_id;
  const [copied, setCopied] = useState(false);

  const handleCopyPhone = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (order.customer_phone) {
      navigator.clipboard.writeText(order.customer_phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Phone number copied to clipboard!");
    }
  };

  return (
    <div
      className={`rounded-xl border transition-all ${
        selected
          ? "border-indigo-500/50 bg-indigo-600/5"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
      } ${order.is_archived ? "opacity-75" : ""}`}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 p-3.5">
        {/* Checkbox */}
        <button
          onClick={onSelect}
          className={`mt-0.5 w-4.5 h-4.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
            selected
              ? "bg-indigo-600 border-indigo-500"
              : "border-zinc-700 hover:border-zinc-500"
          }`}
        >
          {selected && (
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
              <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          {/* Order name + status */}
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-sm font-bold text-zinc-100">{order.shopify_order_name}</span>
            <StatusBadge status={order.internal_status} />
            {order.financial_status && <ShopifyFinancialBadge status={order.financial_status} />}
            {order.fulfillment_status ? (
              <ShopifyFulfillmentBadge status={order.fulfillment_status} />
            ) : (
              <ShopifyFulfillmentBadge status="unfulfilled" />
            )}
          </div>

          {/* Customer info */}
          <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-2">
            <span className="font-medium">{order.customer_name}</span>
            {order.customer_phone && (
              <span className="flex items-center gap-1.5">
                <a href={`tel:${order.customer_phone}`} className="text-indigo-400 hover:underline">
                  {order.customer_phone}
                </a>
                <button
                  onClick={handleCopyPhone}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                  title="Copy Phone Number"
                >
                  {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              </span>
            )}
          </p>

          {/* Items preview */}
          <p className="text-xs text-zinc-600 mt-1 truncate">
            {lineItems.slice(0, 2).map((item: any) => `${item.title} ×${item.quantity}`).join(", ")}
            {lineItems.length > 2 && ` +${lineItems.length - 2} more`}
          </p>

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
      <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-3 border-t border-zinc-800/50 pt-2">
        {/* WhatsApp Confirmation */}
        {order.customer_phone && !order.is_archived && !isDispatched && (
          <a
            href={`https://wa.me/${(() => {
              const d = order.customer_phone.replace(/[^0-9]/g, '');
              return d.startsWith('880') ? d : d.startsWith('0') ? `88${d}` : `880${d}`;
            })()}?text=${encodeURIComponent(
              `আসসালামু আলাইকুম! আপনার ${order.shopify_order_name} অর্ডারটি পেন্ডিং আছে।\n\n${lineItems
                .map((item: any) => `- ${item.title}${item.variant_title ? ` (${item.variant_title})` : ''} x ${item.quantity}`)
                .join('\n')}\n\nমোট বিল: ৳${Number(order.total_price).toLocaleString()}\n\nআপনি কি অর্ডারটি কনফার্ম করতে চান?`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-green-600/15 text-green-400
                      border border-green-600/20 hover:bg-green-600/25 transition-colors mr-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.487-1.761-1.66-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
            </svg>
            WhatsApp
          </a>
        )}
        
        {/* Status actions */}
        {order.internal_status === "pending" && !order.is_archived && (
          <button
            onClick={() => onStatusChange("preparing")}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-amber-600/15 text-amber-300
                      border border-amber-600/20 hover:bg-amber-600/25 transition-colors"
          >
            <Package size={11} /> Preparing
          </button>
        )}

        {order.internal_status !== "hold" && order.internal_status !== "cancelled" && !order.is_archived && (
          <button
            onClick={() => onStatusChange("hold")}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-orange-600/15 text-orange-300
                      border border-orange-600/20 hover:bg-orange-600/25 transition-colors"
          >
            <PauseCircle size={11} /> Hold
          </button>
        )}

        {order.internal_status === "hold" && !order.is_archived && (
          <button
            onClick={() => onStatusChange("preparing")}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-indigo-600/15 text-indigo-300
                      border border-indigo-600/20 hover:bg-indigo-600/25 transition-colors"
          >
            Resume
          </button>
        )}

        {order.internal_status !== "cancelled" && !order.is_archived && (
          <button
            onClick={() => onStatusChange("cancelled")}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-600/15 text-red-400
                      border border-red-600/20 hover:bg-red-600/25 transition-colors"
          >
            <X size={11} /> Cancel
          </button>
        )}

        {/* Archive toggle */}
        <button
          onClick={onArchiveToggle}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-zinc-800/50 text-zinc-400
                    border border-zinc-700/50 hover:bg-zinc-800 hover:text-zinc-200 transition-colors ml-1"
        >
          {order.is_archived ? (
            <><ArchiveRestore size={11} /> Restore</>
          ) : (
            <><Archive size={11} /> Hide</>
          )}
        </button>

        {/* Dispatch button */}
        {!isDispatched && order.internal_status !== "cancelled" && !order.is_archived && (
          <button
            onClick={onDispatch}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600
                      text-white font-semibold hover:bg-indigo-500 transition-colors"
          >
            <Truck size={12} /> Dispatch
          </button>
        )}

        {isDispatched && !order.is_archived && order.internal_status === "dispatched" && (
          <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle size={12} /> Dispatched
          </span>
        )}
      </div>
    </div>
  );
}
