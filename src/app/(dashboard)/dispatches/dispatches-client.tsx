"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Truck, ExternalLink, RotateCw } from "lucide-react";
import { DispatchModal } from "@/components/orders/dispatch-modal";

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
  pathaoStoreId,
}: {
  dispatches: any[];
  count: number;
  currentStatus?: string;
  pathaoStoreId?: number;
}) {
  const router = useRouter();
  const [dispatchOrder, setDispatchOrder] = useState<any | null>(null);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-zinc-100">All Dispatches</h2>
        <p className="text-sm text-zinc-500">{count || 0} total dispatches</p>
      </div>

      {/* Status filters */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {statusFilters.map((s) => (
          <Link
            key={s}
            href={s === "All" ? "/dispatches" : `/dispatches?status=${encodeURIComponent(s)}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
              (s === "All" && !currentStatus) || currentStatus === s
                ? "bg-indigo-600 border-indigo-500 text-white"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-300 bg-zinc-900"
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
          const statusColor = PATHAO_STATUS_COLORS[d.pathao_order_status] || "bg-zinc-800 text-zinc-400 border-zinc-700";
          const order = d.orders;
          const trackingUrl = `https://merchant.pathao.com/tracking?consignment_id=${d.consignment_id}&phone=${encodeURIComponent(d.recipient_phone || order?.customer_phone || "")}`;

          return (
            <div key={d.id} className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Consignment ID */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-zinc-100">
                      {order?.shopify_order_name || d.shopify_order_name}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
                      {d.pathao_order_status || "Pending"}
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

                <div className="text-right shrink-0 flex flex-col items-end">
                  <div className="flex items-center gap-3">
                    {order && (
                      <button
                        onClick={() => setDispatchOrder(order)}
                        className="inline-flex items-center gap-1 text-xs text-emerald-500 hover:text-emerald-400 transition-colors px-2 py-1 bg-emerald-500/10 rounded-md border border-emerald-500/20"
                      >
                        <RotateCw size={10} /> Re-dispatch
                      </button>
                    )}
                    <a
                      href={trackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Track <ExternalLink size={10} />
                    </a>
                  </div>
                  <p className="text-xs text-zinc-600 mt-2">
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
