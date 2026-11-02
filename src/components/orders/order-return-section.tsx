"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Package,
  Layers,
  History,
} from "lucide-react";
import { ReturnModal } from "./return-modal";

interface OrderReturnSectionProps {
  order: any;
  onUpdated?: () => void;
}

export function OrderReturnSection({ order, onUpdated }: OrderReturnSectionProps) {
  const [returnState, setReturnState] = useState<{
    returns: any[];
    classification: "No Return" | "Partial Return" | "Full Return";
    normalizedLineItems: any[];
    summary: {
      originalOrderAmount: number;
      totalOriginalQuantity: number;
      totalReturnedQuantity: number;
      totalRemainingQuantity: number;
      totalReturnedValue: number;
      totalRefundedAmount: number;
      updatedOrderAmount: number;
      canProcessReturn: boolean;
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"partial" | "full" | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const fetchOrderReturnState = useCallback(async () => {
    if (!order?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/returns?orderId=${order.id}`);
      if (res.ok) {
        const data = await res.json();
        setReturnState({
          returns: data.returns || [],
          classification: data.classification || "No Return",
          normalizedLineItems: data.normalizedLineItems || [],
          summary: data.summary || {
            originalOrderAmount: Number(
              order.original_total_price ?? order.total_price ?? 0
            ),
            totalOriginalQuantity: 0,
            totalReturnedQuantity: 0,
            totalRemainingQuantity: 0,
            totalReturnedValue: 0,
            totalRefundedAmount: 0,
            updatedOrderAmount: Number(
              order.original_total_price ?? order.total_price ?? 0
            ),
            canProcessReturn: true,
          },
        });
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [order]);

  useEffect(() => {
    fetchOrderReturnState();
  }, [fetchOrderReturnState]);

  const handleRetrySync = async (returnId: string) => {
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
      toast.success("Synchronized return with Shopify!");
      await fetchOrderReturnState();
      onUpdated?.();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setRetryingId(null);
    }
  };

  const classification = returnState?.classification || "No Return";
  const summary = returnState?.summary;
  const returnsList = returnState?.returns || [];
  const normalizedItems = returnState?.normalizedLineItems || [];
  const latestReturn = returnsList[0] || null;
  const canProcess = summary ? summary.canProcessReturn : true;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
      {/* Header & Return Classification Badge */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <RotateCcw className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Return Section</span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${classification === "Full Return"
                  ? "bg-rose-500/15 text-rose-400 border-rose-500/30"
                  : classification === "Partial Return"
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}
              >
                {classification}
              </span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Two-way synchronized with Shopify Order, Return & Refund records
            </p>
          </div>
        </div>

        {/* Two Clear Actions: Process Partial Return & Process Full Return */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!canProcess || loading}
            onClick={() => setModalMode("partial")}
            className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 disabled:cursor-not-allowed text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <Layers className="w-3.5 h-3.5" />
            Process Partial Return
          </button>

          <button
            type="button"
            disabled={!canProcess || loading}
            onClick={() => setModalMode("full")}
            className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Process Full Return
          </button>
        </div>
      </div>

      {/* Summary Metrics */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">
              Returned / Remaining Qty
            </span>
            <p className="text-sm font-bold text-white mt-1">
              <span className="text-rose-400">{summary.totalReturnedQuantity} returned</span>
              {" • "}
              <span className="text-emerald-400">{summary.totalRemainingQuantity} kept</span>
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">
              Total Returned Value
            </span>
            <p className="text-sm font-bold text-amber-400 mt-1 font-mono">
              ৳{summary.totalReturnedValue.toLocaleString()}
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">
              Shopify Refund Amount
            </span>
            <p className="text-sm font-bold text-rose-400 mt-1 font-mono">
              ৳{summary.totalRefundedAmount.toLocaleString()}
            </p>
          </div>

          <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3">
            <span className="text-[10px] uppercase tracking-wider text-zinc-500 block">
              Shopify Sync Status
            </span>
            <div className="mt-1">
              {returnsList.length === 0 ? (
                <span className="text-xs text-zinc-400">No returns processed</span>
              ) : returnsList.some((r) => r.shopify_sync_status === "failed") ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5" /> Sync Failed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Synced
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Product-by-Product Returned & Remaining Quantities Breakdown */}
      {normalizedItems.length > 0 && (
        <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-indigo-400" />
              Products: Returned vs Remaining Quantities
            </span>
            {latestReturn?.shopify_return_id && (
              <span className="font-mono text-[11px] text-zinc-500">
                Shopify Return ID: {latestReturn.shopify_return_id}
              </span>
            )}
          </div>

          <div className="divide-y divide-zinc-800/60 text-xs">
            {normalizedItems.map((li: any) => (
              <div
                key={li.key}
                className="py-2 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <span className="font-medium text-zinc-200">
                    {li.title}
                    {li.variantTitle ? ` (${li.variantTitle})` : ""}
                  </span>
                  {li.sku && (
                    <span className="font-mono text-zinc-500 ml-1.5">[{li.sku}]</span>
                  )}
                </div>
                <div className="flex items-center gap-3 font-mono">
                  <span className="text-zinc-400">Ordered: {li.originalQuantity}</span>
                  <span
                    className={
                      li.alreadyReturnedQuantity > 0
                        ? "text-rose-400 font-bold"
                        : "text-zinc-500"
                    }
                  >
                    Returned: {li.alreadyReturnedQuantity}
                  </span>
                  <span
                    className={
                      li.unreturnedQuantity > 0
                        ? "text-emerald-400 font-bold"
                        : "text-zinc-500"
                    }
                  >
                    Remaining: {li.unreturnedQuantity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Return History */}
      {returnsList.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-zinc-400" />
            Return History ({returnsList.length})
          </h3>
          <div className="space-y-2">
            {returnsList.map((ret) => (
              <div
                key={ret.id}
                className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${ret.return_type === "partial"
                        ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                        }`}
                    >
                      {ret.return_type === "partial" ? "Partial Return" : "Full Return"}
                    </span>
                    <span className="text-zinc-300 font-semibold">
                      {ret.return_reason || "Customer return"}
                    </span>
                    <span className="text-zinc-500">
                      •{" "}
                      {ret.returned_at
                        ? new Date(ret.returned_at).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                        : ""}
                    </span>
                  </div>
                  <div className="text-zinc-400 font-mono text-[11px] flex flex-wrap gap-3">
                    <span>Returned Qty: {ret.returned_quantity || 1} pcs</span>
                    <span>
                      Value: ৳{Number(ret.returned_product_value || 0).toLocaleString()}
                    </span>
                    <span className="text-rose-400 font-semibold">
                      Shopify Refund: ৳{Number(ret.refund_amount || 0).toLocaleString()}
                    </span>
                    {ret.shopify_return_id && (
                      <span>Return ID: {String(ret.shopify_return_id).split("/").pop()}</span>
                    )}
                    {ret.shopify_refund_id && (
                      <span>Refund ID: {String(ret.shopify_refund_id).split("/").pop()}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {ret.shopify_sync_status === "failed" ? (
                    <>
                      <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30 text-[11px] font-bold">
                        Sync Failed
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRetrySync(ret.id)}
                        disabled={retryingId === ret.id}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-[11px] flex items-center gap-1"
                      >
                        <RefreshCw
                          className={`w-3 h-3 ${retryingId === ret.id ? "animate-spin" : ""}`}
                        />
                        Retry Sync
                      </button>
                    </>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[11px] font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Synced
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Return Modal */}
      {modalMode && (
        <ReturnModal
          orders={[order]}
          initialMode={modalMode}
          onClose={() => setModalMode(null)}
          onSuccess={() => {
            setModalMode(null);
            fetchOrderReturnState();
            onUpdated?.();
          }}
        />
      )}
    </div>
  );
}

