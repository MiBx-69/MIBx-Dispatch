"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Truck, ExternalLink, RotateCw, RotateCcw, ShieldCheck, X, Search, Loader2, CheckCircle2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { DispatchModal } from "@/components/orders/dispatch-modal";
import { ReturnModal } from "@/components/orders/return-modal";
import { DeliverModal } from "@/components/orders/deliver-modal";
import { FraudDetailsModal } from "@/components/modals/fraud-details-modal";
import { BulkImportDeliveriesModal } from "@/components/orders/bulk-import-deliveries-modal";
import { DispatchesReportingHeader, DispatchStats } from "@/components/dispatches/dispatches-reporting-header";

const PATHAO_STATUS_COLORS: Record<string, string> = {
  "Pending": "bg-zinc-800 text-zinc-400 border-zinc-700",
  "Picked Up": "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "In Transit": "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  "Out for Delivery": "bg-violet-500/10 text-violet-400 border-violet-500/20",
  "Delivered": "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Return": "bg-red-500/10 text-red-400 border-red-500/20",
  "Return Completed": "bg-orange-500/10 text-orange-400 border-orange-500/20",
  "Cancelled": "bg-red-500/10 text-red-400 border-red-500/20",
  "Hold": "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const statusFilters = [
  "All", "Pending", "Picked Up", "In Transit", "Out for Delivery",
  "Delivered", "Return", "Return Completed", "Hold", "Cancelled",
];

export function DispatchesClient({
  dispatches,
  count,
  currentStatus,
  currentSearch,
  pathaoStoreId,
  dateFilter = "all",
  startDate,
  endDate,
  totalAmount = 0,
  totalQuantity = 0,
  stats,
  page = 1,
  pageSize = 50,
}: {
  dispatches: any[];
  count: number;
  currentStatus?: string;
  currentSearch?: string;
  pathaoStoreId?: number;
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
  totalAmount?: number;
  totalQuantity?: number;
  stats?: DispatchStats | null;
  page?: number;
  pageSize?: number;
}) {
  const router = useRouter();
  const [dispatchOrder, setDispatchOrder] = useState<any | null>(null);
  const [returnOrder, setReturnOrder] = useState<any | null>(null);
  const [deliverOrder, setDeliverOrder] = useState<any | null>(null);
  const [viewFraudOrder, setViewFraudOrder] = useState<any | null>(null);
  const [isCheckingFraud, setIsCheckingFraud] = useState(false);
  const [bulkImportDeliveriesOpen, setBulkImportDeliveriesOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState(currentSearch || "");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === (dispatches?.length || 0)) {
      setSelected(new Set());
    } else {
      setSelected(new Set((dispatches || []).map((d: any) => d.id)));
    }
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchQuery !== (currentSearch || "")) {
        startTransition(() => {
          const params = new URLSearchParams(window.location.search);
          if (searchQuery) {
            params.set("search", searchQuery);
          } else {
            params.delete("search");
          }
          params.delete("page");
          router.push(`/dispatches?${params.toString()}`);
        });
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery, currentSearch, router]);

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

      setViewFraudOrder((prev: any) => prev?.id === orderId ? { ...prev, ...updatedOrder } : prev);
      
      router.refresh();
      
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    } finally {
      setIsCheckingFraud(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    startTransition(() => {
      const params = new URLSearchParams(window.location.search);
      params.set("page", newPage.toString());
      router.push(`/dispatches?${params.toString()}`);
    });
  };

  const removeDispatch = async (dispatchId: string) => {
    if (!confirm("Are you sure you want to remove this dispatch? The order will be moved to the Removed section.")) return;
    
    const toastId = toast.loading("Removing dispatch...");
    try {
      const res = await fetch(`/api/dispatches/${dispatchId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to remove dispatch");
      toast.success("Dispatch removed and order archived", { id: toastId });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message, { id: toastId });
    }
  };

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Small, Sleek Dispatches Reporting Header */}
      <DispatchesReportingHeader
        stats={stats || null}
        onOpenImportModal={() => setBulkImportDeliveriesOpen(true)}
      />

      {/* Search & Select All Bar (Mobile-First) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        <div className="relative flex-1 min-w-0 sm:max-w-xs">
          <input
            type="text"
            placeholder="Search phone, order, consignment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs sm:text-sm rounded-xl pl-8 pr-8 py-2 w-full outline-none focus:border-indigo-500 transition-colors"
          />
          <Search className="w-4 h-4 text-zinc-500 absolute left-2.5 top-2.5" />
          {isPending && (
            <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 text-zinc-400 animate-spin" />
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={selectAll}
            className="px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all"
          >
            {selected.size === (dispatches?.length || 0) && (dispatches?.length || 0) > 0 ? "Deselect All" : `Select All (${dispatches?.length || 0})`}
          </button>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 items-center scrollbar-hide">
        {statusFilters.map((s) => (
          <Link
            key={s}
            href={s === "All" ? "/dispatches" : `/dispatches?status=${encodeURIComponent(s)}`}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap border transition-all ${
              (s === "All" && !currentStatus) || currentStatus === s
                ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                : "border-zinc-800/80 text-zinc-400 hover:text-zinc-200 bg-zinc-900/80 hover:bg-zinc-800/80"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {/* Dispatches list */}
      <div className="space-y-2">
        {(!dispatches || dispatches.length === 0) && (
          <div className="text-center py-16 text-zinc-600">
            <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No dispatches found</p>
          </div>
        )}
        {dispatches?.map((d: any) => {
          const STATUS_MAP: Record<string, string> = {
            "order.assigned_for_pickup": "Pending",
            "order.pickup_cancelled": "Pending",
            "order.pickup_collected": "Picked Up",
            "order.in_transit": "In Transit",
            "order.at_delivery_hub": "In Transit",
            "order.out_for_delivery": "Out for Delivery",
            "order.delivered": "Delivered",
            "order.partial_delivery": "Delivered",
            "order.payment_received": "Delivered",
            "order.return_in_transit": "Return",
            "order.returned": "Return Completed",
            "order.hold": "Hold",
            "order.failed": "Hold",
            "order.cancelled": "Cancelled",
          };
          
          let friendlyStatus = STATUS_MAP[d.pathao_order_status] || d.pathao_order_status || "Pending";
          let statusColor = PATHAO_STATUS_COLORS[friendlyStatus] || PATHAO_STATUS_COLORS["Pending"];
          const order = d.orders;
          
          // Override status if a return exists
          const returnRecord = order?.returns?.[0];
          if (returnRecord) {
            if (returnRecord.return_type === "partial") {
              friendlyStatus = "Partially Returned";
              statusColor = "text-amber-400 border-amber-400/30 bg-amber-400/10";
            } else {
              friendlyStatus = "Returned (Manual)";
              statusColor = "text-rose-400 border-rose-400/30 bg-rose-400/10";
            }
          } else if (order?.internal_status === "returned") {
            friendlyStatus = "Return Completed";
            statusColor = "text-rose-400 border-rose-400/30 bg-rose-400/10";
          }

          const trackingUrl = `https://merchant.pathao.com/tracking?consignment_id=${d.consignment_id}&phone=${encodeURIComponent(d.recipient_phone || order?.customer_phone || "")}`;

          return (
            <div key={d.id} className={`p-4 rounded-xl border transition-all ${selected.has(d.id) ? 'border-indigo-500/50 bg-indigo-500/5' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}`}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-3">
                <div className="flex-1 min-w-0 flex items-start gap-3">
                  <div className="pt-0.5">
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggleSelect(d.id)}
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-zinc-900"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Consignment ID */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-zinc-100">
                      {order?.shopify_order_name || d.shopify_order_name}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
                      {friendlyStatus}
                    </span>
                  </div>

                  <p className="text-xs text-indigo-400 mt-0.5 font-mono">
                    {d.consignment_id}
                  </p>

                  {/* Customer */}
                  <p className="text-xs text-zinc-500 mt-1">
                    {d.recipient_name || order?.customer_name}
                    {d.recipient_phone && ` · ${d.recipient_phone}`}
                  </p>

                  {/* Amount */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-emerald-400 font-semibold">
                      COD: ৳{Number(d.amount_to_collect || 0).toLocaleString()}
                    </span>
                    {d.delivery_fee && (
                      <span className="text-xs text-zinc-600">
                        Fee: ৳{d.delivery_fee}
                      </span>
                    )}
                  </div>
                </div>
                </div>

                <div className="w-full sm:w-auto sm:text-right shrink-0 flex flex-col sm:items-end gap-3 sm:gap-0">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    {order && (
                      <button
                        onClick={() => setDispatchOrder(order)}
                        className="inline-flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-400 transition-colors px-2 py-1 bg-emerald-500/10 rounded-md border border-emerald-500/20"
                      >
                        <RotateCw size={10} /> Re-dispatch
                      </button>
                    )}
                    <button
                      onClick={() => removeDispatch(d.id)}
                      className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors px-2 py-1 bg-red-500/10 rounded-md border border-red-500/20"
                    >
                      <X size={10} /> Remove
                    </button>
                    {order && (
                      <button
                        onClick={() => setDeliverOrder(order)}
                        className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors px-2 py-1 bg-emerald-500/10 rounded-md border border-emerald-500/20"
                      >
                        <CheckCircle2 size={10} /> Deliver
                      </button>
                    )}
                    {order && (
                      <button
                        onClick={() => setReturnOrder(order)}
                        className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition-colors px-2 py-1 bg-rose-500/10 rounded-md border border-rose-500/20"
                      >
                        <RotateCcw size={10} /> Return
                      </button>
                    )}
                    {order && (
                      <button
                        onClick={() => setViewFraudOrder(order)}
                        className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-zinc-100 transition-colors px-2 py-1 bg-zinc-800 rounded-md border border-zinc-700"
                      >
                        <ShieldCheck size={10} /> Fraud Check
                      </button>
                    )}
                    <a
                      href={trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors ml-auto sm:ml-0"
                    >
                      Track <ExternalLink size={10} />
                    </a>
                  </div>
                  <p className="text-xs text-zinc-600 sm:mt-2 text-right sm:text-right w-full sm:w-auto">
                    {new Date(d.dispatched_at).toLocaleDateString("en-BD", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Pagination Controls */}
      {count > pageSize && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 border-t border-zinc-800/50 mt-4">
          <p className="text-sm text-zinc-400">
            Showing <span className="font-medium text-zinc-200">{Math.min((page - 1) * pageSize + 1, count)}</span> to <span className="font-medium text-zinc-200">{Math.min(page * pageSize, count)}</span> of <span className="font-medium text-zinc-200">{count}</span> results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1 || isPending}
              className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <div className="text-sm font-medium text-zinc-400">
              Page {page} of {Math.ceil(count / pageSize)}
            </div>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= Math.ceil(count / pageSize) || isPending}
              className="px-3 py-1.5 text-sm font-medium text-zinc-300 bg-zinc-900 border border-zinc-700 rounded-lg hover:bg-zinc-800 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

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

      <FraudDetailsModal
        order={viewFraudOrder}
        onClose={() => setViewFraudOrder(null)}
        onCheckAgain={manualFraudCheck}
        isChecking={isCheckingFraud}
      />

      {returnOrder && (
        <ReturnModal
          orders={Array.isArray(returnOrder) ? returnOrder : [returnOrder]}
          onClose={() => {
            setReturnOrder(null);
            if (Array.isArray(returnOrder)) setSelected(new Set());
          }}
          onSuccess={() => {
            setReturnOrder(null);
            if (Array.isArray(returnOrder)) setSelected(new Set());
            router.refresh();
          }}
        />
      )}

      {deliverOrder && (
        <DeliverModal
          orders={Array.isArray(deliverOrder) ? deliverOrder : [deliverOrder]}
          onClose={() => {
            setDeliverOrder(null);
            if (Array.isArray(deliverOrder)) setSelected(new Set());
          }}
          onSuccess={() => {
            setDeliverOrder(null);
            if (Array.isArray(deliverOrder)) setSelected(new Set());
            router.refresh();
          }}
        />
      )}

      {/* Fixed Bulk Action Bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 p-3 rounded-2xl shadow-2xl flex items-center gap-4 z-50 animate-slide-up">
          <div className="flex items-center gap-2 px-2">
            <div className="bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-md text-xs font-bold">
              {selected.size}
            </div>
            <span className="text-sm text-zinc-300 font-medium">selected</span>
          </div>
          
          <div className="h-6 w-px bg-zinc-800"></div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const selectedOrders = dispatches.filter((d: any) => selected.has(d.id) && d.orders).map((d: any) => d.orders);
                if (selectedOrders.length > 0) setDeliverOrder(selectedOrders);
              }}
              className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 size={16} /> Mark as Delivered
            </button>
            <button
              onClick={() => {
                const selectedOrders = dispatches.filter((d: any) => selected.has(d.id) && d.orders).map((d: any) => d.orders);
                if (selectedOrders.length > 0) setReturnOrder(selectedOrders);
              }}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
            >
              <RotateCcw size={16} /> Mark as Returned
            </button>
          </div>
        </div>
      )}

      {bulkImportDeliveriesOpen && (
        <BulkImportDeliveriesModal
          onClose={() => setBulkImportDeliveriesOpen(false)}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
