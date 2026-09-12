"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Truck, CheckCircle2, RotateCcw, ShieldCheck, AlertCircle, ExternalLink,
  Phone, MapPin, Package, RefreshCw, Clock
} from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOrderDisplayStatus } from "@/lib/order-status";
import { DispatchModal } from "@/components/orders/dispatch-modal";

interface EmbeddedOrderClientProps {
  order: any;
  pathaoStoreId: number | null;
}

export function EmbeddedOrderClient({ order: initialOrder, pathaoStoreId }: EmbeddedOrderClientProps) {
  const [order, setOrder] = useState(initialOrder);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const activeDispatch = order.dispatches?.find((d: any) => !d.is_cancelled) || order.dispatches?.[0];
  const consignmentId = activeDispatch?.consignment_id || order.pathao_consignment_id;
  const isDelivered = order.internal_status === "delivered" || Boolean(order.delivered_at) || getOrderDisplayStatus(order) === "delivered";
  const isReturned = order.internal_status === "returned" || Boolean(order.returned_at) || getOrderDisplayStatus(order) === "returned";

  const handleUndeliver = async () => {
    if (!confirm("Mark this order as Undelivered? This will restore its previous status.")) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/deliveries/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [order.id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark as undelivered");
      toast.success("Order marked as Undelivered");
      setOrder((prev: any) => ({
        ...prev,
        internal_status: consignmentId ? "dispatched" : "pending",
        delivered_at: null,
        pathao_delivery_status: null,
      }));
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnreturn = async () => {
    if (!confirm("Mark this order as Unreturned? This will remove return records and restore its previous status.")) return;
    setIsLoading(true);
    try {
      const res = await fetch("/api/returns/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [order.id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark as unreturned");
      toast.success("Order marked as Unreturned");
      setOrder((prev: any) => ({
        ...prev,
        internal_status: consignmentId ? "dispatched" : "pending",
        returned_at: null,
        return_reason: null,
        return_delivery_fee: 0,
      }));
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeliver = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: [order.id], delivery_type: "full" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark delivered");
      toast.success("Order marked as Delivered");
      setOrder((prev: any) => ({
        ...prev,
        internal_status: "delivered",
        delivered_at: new Date().toISOString(),
        pathao_delivery_status: "Delivered",
      }));
    } catch (err: any) {
      toast.error(err.message || "Failed to deliver");
    } finally {
      setIsLoading(false);
    }
  };

  const lineItems = (order.line_items as any[]) || [];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 font-sans antialiased text-sm">
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Header Banner */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Truck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base text-zinc-100">{order.shopify_order_name}</h1>
                <StatusBadge status={getOrderDisplayStatus(order)} />
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Shopify ID: {order.shopify_order_id} • ৳{Number(order.total_price || 0).toLocaleString()}
              </p>
            </div>
          </div>

          <a
            href={`/orders?search=${encodeURIComponent(order.shopify_order_name)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors border border-zinc-700"
          >
            <span>Open ERP</span>
            <ExternalLink size={12} />
          </a>
        </div>

        {/* Courier Tracking Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <Package size={14} className="text-indigo-400" />
              <span>Courier Consignment</span>
            </div>
            {consignmentId && (
              <span className="text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                {consignmentId}
              </span>
            )}
          </div>

          {consignmentId ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Pathao Status:</span>
                <span className="font-medium text-zinc-200">
                  {order.pathao_delivery_status || activeDispatch?.pathao_order_status || "Dispatched"}
                </span>
              </div>
              {activeDispatch?.dispatched_at && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Dispatched At:</span>
                  <span className="text-zinc-400">
                    {new Date(activeDispatch.dispatched_at).toLocaleString("en-BD", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </div>
              )}
              <div className="pt-2 flex gap-2">
                <a
                  href={`https://merchant.pathao.com/cn-tracking/${consignmentId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 rounded-xl bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-600/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Track on Pathao</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 space-y-3">
              <p className="text-xs text-zinc-400">Not yet consigned to Pathao Courier.</p>
              <button
                onClick={() => setIsDispatchModalOpen(true)}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-all shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2"
              >
                <Truck size={14} />
                <span>Dispatch to Pathao Now</span>
              </button>
            </div>
          )}
        </div>

        {/* Quick Actions Panel */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800/80 pb-2">
            Status Actions
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              onClick={() => setIsDispatchModalOpen(true)}
              disabled={isLoading}
              className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
            >
              <Truck size={14} className="text-indigo-400" />
              <span>{consignmentId ? "Re-dispatch" : "Dispatch"}</span>
            </button>

            {!isDelivered ? (
              <button
                onClick={handleDeliver}
                disabled={isLoading}
                className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <CheckCircle2 size={14} />
                <span>Mark Delivered</span>
              </button>
            ) : (
              <button
                onClick={handleUndeliver}
                disabled={isLoading}
                className="p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw size={14} />
                <span>Undelivered</span>
              </button>
            )}

            {isReturned && (
              <button
                onClick={handleUnreturn}
                disabled={isLoading}
                className="p-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <RotateCcw size={14} />
                <span>Unreturned</span>
              </button>
            )}
          </div>
        </div>

        {/* Customer & Address Details */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800/80 pb-2">
            Recipient Information
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Name:</span>
              <span className="font-semibold text-zinc-200">{order.customer_name || "Guest"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Phone:</span>
              <span className="font-mono text-zinc-200 flex items-center gap-1">
                <Phone size={12} className="text-zinc-500" />
                {order.customer_phone || "N/A"}
              </span>
            </div>
            {order.shipping_address && (
              <div className="flex items-start justify-between gap-4 pt-1">
                <span className="text-zinc-500 shrink-0 flex items-center gap-1">
                  <MapPin size={12} /> Address:
                </span>
                <span className="text-right text-zinc-300">
                  {order.shipping_address.address1 || ""}{order.shipping_address.city ? `, ${order.shipping_address.city}` : ""}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Ordered Items Summary */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-sm space-y-2">
          <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-800/80 pb-2">
            Line Items ({lineItems.length})
          </div>
          <div className="divide-y divide-zinc-800/50">
            {lineItems.map((item: any, idx: number) => (
              <div key={idx} className="py-2 flex items-center justify-between text-xs">
                <div>
                  <p className="font-medium text-zinc-200">{item.title || item.name}</p>
                  {item.variant_title && (
                    <p className="text-[11px] text-zinc-500">{item.variant_title}</p>
                  )}
                </div>
                <div className="text-right">
                  <span className="font-mono text-zinc-400">x{item.quantity}</span>
                  <p className="text-zinc-300 font-semibold mt-0.5">৳{Number(item.price || 0).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dispatch Modal */}
      {isDispatchModalOpen && (
        <DispatchModal
          order={order}
          storeId={pathaoStoreId}
          onClose={() => setIsDispatchModalOpen(false)}
          onSuccess={() => {
            setIsDispatchModalOpen(false);
            toast.success("Order dispatched to Pathao!");
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
