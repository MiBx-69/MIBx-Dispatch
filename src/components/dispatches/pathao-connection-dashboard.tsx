"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Truck,
  Banknote,
  Webhook,
  RotateCcw,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export interface PathaoDashboardTelemetry {
  connection: {
    apiConfigured: boolean;
    webhookSecretConfigured: boolean;
    webhookUrl: string;
    lastWebhookReceivedAt: string | null;
    lastReconciliationAt: string | null;
    failedWebhookCount: number;
  };
  parcelOverview: {
    totalDispatched: number;
    pickupPending: number;
    pickedUp: number;
    inTransit: number;
    outForDelivery: number;
    delivered: number;
    partialDelivery: number;
    returnInTransit: number;
    returnedToMerchant: number;
    onHoldOrFailed: number;
  };
  financialOverview: {
    expectedCod: number;
    deliveredCod: number;
    pendingSettlement: number;
    paymentInvoiceReceivedAmount: number;
    paymentInvoiceCount: number;
    paidReturnCount: number;
  };
}

export function PathaoConnectionDashboard({
  telemetry,
}: {
  telemetry: PathaoDashboardTelemetry;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isRetryingWebhooks, setIsRetryingWebhooks] = useState(false);

  const { connection, parcelOverview, financialOverview } = telemetry;

  const formatTimeBst = (iso: string | null) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "Asia/Dhaka",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleReconcileNow = async () => {
    setIsReconciling(true);
    try {
      const res = await fetch("/api/pathao/sync-status", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reconciliation failed");
      toast.success(
        `Reconciled ${data.totalChecked || 0} parcels (${data.updatedCount || 0} updated)`
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to reconcile Pathao parcels");
    } finally {
      setIsReconciling(false);
    }
  };

  const handleRetryFailedWebhooks = async () => {
    setIsRetryingWebhooks(true);
    try {
      const res = await fetch("/api/webhooks/pathao/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retryAllFailed: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to retry webhooks");
      toast.success(
        `Retried ${data.retriedCount || 0} webhook events (${data.succeeded || 0} succeeded)`
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to retry webhooks");
    } finally {
      setIsRetryingWebhooks(false);
    }
  };

  return (
    <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-xl p-3 space-y-3 text-xs">
      {/* Top Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <Webhook className="w-4 h-4 text-indigo-400" />
            <span>Pathao Courier Connection & Live Sync</span>
          </div>

          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              connection.apiConfigured
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25"
                : "bg-amber-500/10 text-amber-400 border-amber-500/25"
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            API: {connection.apiConfigured ? "Connected" : "Check Settings"}
          </span>

          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
              connection.webhookSecretConfigured
                ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/25"
                : "bg-zinc-800 text-zinc-400 border-zinc-700"
            }`}
            title={connection.webhookUrl}
          >
            Webhook: {connection.webhookSecretConfigured ? "Verified" : "Open"}
          </span>

          <span className="text-[11px] text-zinc-400">
            Last Webhook:{" "}
            <strong className="text-zinc-200 font-mono">
              {formatTimeBst(connection.lastWebhookReceivedAt)}
            </strong>
          </span>

          <span className="text-[11px] text-zinc-400">
            Last Reconciliation:{" "}
            <strong className="text-zinc-200 font-mono">
              {formatTimeBst(connection.lastReconciliationAt)}
            </strong>
          </span>

          {connection.failedWebhookCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <AlertTriangle className="w-3 h-3" />
              {connection.failedWebhookCount} Failed Event
              {connection.failedWebhookCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {connection.failedWebhookCount > 0 && (
            <button
              type="button"
              onClick={handleRetryFailedWebhooks}
              disabled={isRetryingWebhooks}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition-colors disabled:opacity-50"
            >
              <RotateCcw
                className={`w-3 h-3 ${isRetryingWebhooks ? "animate-spin" : ""}`}
              />
              {isRetryingWebhooks ? "Retrying..." : "Retry Failed Events"}
            </button>
          )}

          <button
            type="button"
            onClick={handleReconcileNow}
            disabled={isReconciling}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3 h-3 ${isReconciling ? "animate-spin" : ""}`}
            />
            {isReconciling ? "Reconciling..." : "Reconcile Now"}
          </button>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
            title={expanded ? "Collapse telemetry" : "Expand telemetry"}
          >
            {expanded ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-2.5 pt-2 border-t border-zinc-800/70">
          {/* Parcel Lifecycle Overview (10 Metrics) */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 mb-1.5">
              <Truck className="w-3.5 h-3.5 text-indigo-400" />
              <span>Parcel Lifecycle Overview</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5">
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg p-2">
                <span className="text-[10px] text-zinc-500 block">
                  Total Dispatched
                </span>
                <span className="text-xs font-bold font-mono text-zinc-100">
                  {parcelOverview.totalDispatched.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg p-2">
                <span className="text-[10px] text-zinc-500 block">
                  Pickup Pending
                </span>
                <span className="text-xs font-bold font-mono text-zinc-300">
                  {parcelOverview.pickupPending.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg p-2">
                <span className="text-[10px] text-blue-400 block">
                  Picked Up
                </span>
                <span className="text-xs font-bold font-mono text-blue-300">
                  {parcelOverview.pickedUp.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg p-2">
                <span className="text-[10px] text-indigo-400 block">
                  In Transit
                </span>
                <span className="text-xs font-bold font-mono text-indigo-300">
                  {parcelOverview.inTransit.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg p-2">
                <span className="text-[10px] text-cyan-400 block">
                  Out for Delivery
                </span>
                <span className="text-xs font-bold font-mono text-cyan-300">
                  {parcelOverview.outForDelivery.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg p-2">
                <span className="text-[10px] text-emerald-400 block">
                  Delivered
                </span>
                <span className="text-xs font-bold font-mono text-emerald-400">
                  {parcelOverview.delivered.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg p-2">
                <span className="text-[10px] text-teal-400 block">
                  Partial Delivery
                </span>
                <span className="text-xs font-bold font-mono text-teal-300">
                  {parcelOverview.partialDelivery.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg p-2">
                <span className="text-[10px] text-amber-400 block">
                  Return In Transit
                </span>
                <span className="text-xs font-bold font-mono text-amber-300">
                  {parcelOverview.returnInTransit.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg p-2">
                <span className="text-[10px] text-orange-400 block">
                  Returned to Merchant
                </span>
                <span className="text-xs font-bold font-mono text-orange-300">
                  {parcelOverview.returnedToMerchant.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg p-2">
                <span className="text-[10px] text-rose-400 block">
                  On Hold / Failed
                </span>
                <span className="text-xs font-bold font-mono text-rose-400">
                  {parcelOverview.onHoldOrFailed.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Financial & COD Settlement Overview (5 Metrics) */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 mb-1.5">
              <Banknote className="w-3.5 h-3.5 text-emerald-400" />
              <span>Pathao COD & Settlement Overview</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg px-2.5 py-2">
                <span className="text-[10px] text-zinc-500 block">
                  Expected COD
                </span>
                <span className="text-xs font-bold font-mono text-zinc-200">
                  ৳{financialOverview.expectedCod.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg px-2.5 py-2">
                <span className="text-[10px] text-emerald-400 block">
                  Delivered COD
                </span>
                <span className="text-xs font-bold font-mono text-emerald-400">
                  ৳{financialOverview.deliveredCod.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg px-2.5 py-2">
                <span className="text-[10px] text-amber-400 block">
                  Pending Settlement
                </span>
                <span className="text-xs font-bold font-mono text-amber-300">
                  ৳{financialOverview.pendingSettlement.toLocaleString()}
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg px-2.5 py-2">
                <span className="text-[10px] text-indigo-400 block">
                  Payment Invoice Received
                </span>
                <span className="text-xs font-bold font-mono text-indigo-300">
                  ৳
                  {financialOverview.paymentInvoiceReceivedAmount.toLocaleString()}{" "}
                  <span className="text-[10px] text-zinc-500 font-normal">
                    ({financialOverview.paymentInvoiceCount})
                  </span>
                </span>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800/70 rounded-lg px-2.5 py-2">
                <span className="text-[10px] text-rose-400 block">
                  Paid Return Count
                </span>
                <span className="text-xs font-bold font-mono text-rose-300">
                  {financialOverview.paidReturnCount.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

