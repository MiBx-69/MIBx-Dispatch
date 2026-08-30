"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Search, Filter, ChevronLeft, ChevronRight,
  Truck, Package, X, CheckCircle, PauseCircle, AlertCircle,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { DispatchModal } from "@/components/orders/dispatch-modal";
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
  page,
  pageSize,
  currentStatus,
  currentSearch,
  pathaoStoreId,
}: OrdersClientProps) {
  const router = useRouter();
  const [search, setSearch] = useState(currentSearch || "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dispatchOrder, setDispatchOrder] = useState<Order | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.ceil(total / pageSize);

  const navigate = useCallback(
    (params: Record<string, string | undefined>) => {
      const sp = new URLSearchParams();
      if (params.status && params.status !== "all") sp.set("status", params.status);
      if (params.search) sp.set("search", params.search);
      if (params.page && params.page !== "1") sp.set("page", params.page);
      startTransition(() => {
        router.push(`/orders${sp.toString() ? `?${sp.toString()}` : ""}`);
      });
    },
    [router]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ status: currentStatus, search, page: "1" });
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (selected.size === orders.length) setSelected(new Set());
    else setSelected(new Set(orders.map((o) => o.id)));
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
    } catch {
      toast.error("Failed to update status");
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
    } catch {
      toast.error("Bulk update failed");
    }
  };

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
                navigate({ status: f.value, search: currentSearch, page: "1" })
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
        <div className="flex items-center gap-2 p-3 rounded-xl bg-indigo-600/10 border border-indigo-500/30 animate-fade-in">
          <span className="text-xs text-indigo-300 font-medium">
            {selected.size} selected
          </span>
          <div className="flex gap-2 ml-auto">
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
              onClick={() => setSelected(new Set())}
              className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          {total > 0 ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : "0"} orders
        </span>
        <button onClick={selectAll} className="hover:text-zinc-300 transition-colors">
          {selected.size === orders.length && orders.length > 0 ? "Deselect all" : "Select all"}
        </button>
      </div>

      {/* Orders list */}
      <div className="space-y-2">
        {orders.length === 0 && (
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

        {orders.map((order: Order) => (
          <OrderCard
            key={order.id}
            order={order}
            selected={selected.has(order.id)}
            onSelect={() => toggleSelect(order.id)}
            onStatusChange={(status) => updateStatus(order.id, status)}
            onDispatch={() => setDispatchOrder(order)}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => navigate({ status: currentStatus, search: currentSearch, page: String(page - 1) })}
            disabled={page === 1}
            className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200
                      hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-zinc-400">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => navigate({ status: currentStatus, search: currentSearch, page: String(page + 1) })}
            disabled={page === totalPages}
            className="p-2 rounded-lg border border-zinc-800 text-zinc-400 hover:text-zinc-200
                      hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

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
    </div>
  );
}

interface OrderCardProps {
  order: Order;
  selected: boolean;
  onSelect: () => void;
  onStatusChange: (status: OrderStatus) => void;
  onDispatch: () => void;
}

function OrderCard({ order, selected, onSelect, onStatusChange, onDispatch }: OrderCardProps) {
  const lineItems = (order.line_items as any[]) || [];
  const isDispatched = !!order.pathao_consignment_id;

  return (
    <div
      className={`rounded-xl border transition-all ${
        selected
          ? "border-indigo-500/50 bg-indigo-600/5"
          : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
      }`}
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
            {order.financial_status === "paid" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Paid
              </span>
            )}
          </div>

          {/* Customer info */}
          <p className="text-xs text-zinc-400 mt-0.5">
            <span className="font-medium">{order.customer_name}</span>
            {order.customer_phone && (
              <a href={`tel:${order.customer_phone}`} className="ml-2 text-indigo-400 hover:underline">
                {order.customer_phone}
              </a>
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
      <div className="flex items-center gap-1.5 px-3.5 pb-3 border-t border-zinc-800/50 pt-2">
        {/* Status actions */}
        {order.internal_status === "pending" && (
          <button
            onClick={() => onStatusChange("preparing")}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-amber-600/15 text-amber-300
                      border border-amber-600/20 hover:bg-amber-600/25 transition-colors"
          >
            <Package size={11} /> Preparing
          </button>
        )}

        {order.internal_status !== "hold" && order.internal_status !== "cancelled" && (
          <button
            onClick={() => onStatusChange("hold")}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-orange-600/15 text-orange-300
                      border border-orange-600/20 hover:bg-orange-600/25 transition-colors"
          >
            <PauseCircle size={11} /> Hold
          </button>
        )}

        {order.internal_status === "hold" && (
          <button
            onClick={() => onStatusChange("preparing")}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-indigo-600/15 text-indigo-300
                      border border-indigo-600/20 hover:bg-indigo-600/25 transition-colors"
          >
            Resume
          </button>
        )}

        {order.internal_status !== "cancelled" && (
          <button
            onClick={() => onStatusChange("cancelled")}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-red-600/15 text-red-400
                      border border-red-600/20 hover:bg-red-600/25 transition-colors"
          >
            <X size={11} /> Cancel
          </button>
        )}

        {/* Dispatch button */}
        {!isDispatched && order.internal_status !== "cancelled" && (
          <button
            onClick={onDispatch}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-indigo-600
                      text-white font-semibold hover:bg-indigo-500 transition-colors"
          >
            <Truck size={12} /> Dispatch
          </button>
        )}

        {isDispatched && (
          <span className="ml-auto text-xs text-emerald-400 flex items-center gap-1">
            <CheckCircle size={12} /> Dispatched
          </span>
        )}
      </div>
    </div>
  );
}
