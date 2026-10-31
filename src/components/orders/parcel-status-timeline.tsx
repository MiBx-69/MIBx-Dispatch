"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCcw,
  ExternalLink,
  RefreshCw,
  Truck,
  Package,
  Calendar,
  Banknote,
} from "lucide-react";
import {
  buildParcelTimelineSteps,
  normalizePathaoEvent,
  type TimelineStep,
} from "@/lib/pathao/status-engine";
import { formatPathaoTrackingUrl } from "@/lib/pathao/client";

interface ParcelStatusTimelineProps {
  order: any;
  dispatch?: any;
}

export function ParcelStatusTimeline({
  order,
  dispatch,
}: ParcelStatusTimelineProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);

  const activeDispatch =
    dispatch ||
    order.dispatches?.find((d: any) => !d.is_cancelled) ||
    order.dispatches?.[0];

  const consignmentId =
    activeDispatch?.consignment_id || order.pathao_consignment_id;
  if (!consignmentId) {
    return null;
  }

  const rawPhone =
    activeDispatch?.recipient_phone ||
    order.customer_phone ||
    order.shipping_address?.phone ||
    "";
  const trackingUrl = formatPathaoTrackingUrl(consignmentId, rawPhone);

  const normalizedStatus =
    activeDispatch?.normalized_status ||
    normalizePathaoEvent(
      activeDispatch?.pathao_order_status || order.pathao_delivery_status
    ).normalizedStatus;

  const steps = buildParcelTimelineSteps({
    normalizedStatus,
    rawStatus:
      activeDispatch?.pathao_order_status || order.pathao_delivery_status,
    dispatchedAt: activeDispatch?.dispatched_at || order.created_at,
    deliveredAt: activeDispatch?.delivered_at || order.delivered_at,
    returnInitiatedAt: activeDispatch?.return_initiated_at,
    returnedToMerchantAt: activeDispatch?.returned_to_merchant_at,
    lastEventTimestamp: activeDispatch?.last_event_timestamp,
  });

  const handleSyncWithCourier = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/pathao/sync-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consignmentIds: [consignmentId] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      toast.success(
        data.updatedCount > 0
          ? "Parcel status updated from Pathao"
          : "Parcel is already up to date with Pathao"
      );
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to sync with Pathao");
    } finally {
      setIsSyncing(false);
    }
  };

  const formatBstDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    return new Date(dateStr).toLocaleString("en-US", {
      timeZone: "Asia/Dhaka",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStepIcon = (state: TimelineStep["state"]) => {
    switch (state) {
      case "completed":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case "current":
        return <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-ping" />;
      case "warning":
        return <AlertCircle className="w-4 h-4 text-amber-400" />;
      case "returned":
        return <RotateCcw className="w-4 h-4 text-rose-400" />;
      default:
        return <div className="w-2 h-2 rounded-full bg-zinc-600" />;
    }
  };

  const getStepBorderColor = (state: TimelineStep["state"]) => {
    switch (state) {
      case "completed":
        return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
      case "current":
        return "border-indigo-500 bg-indigo-500/20 text-white ring-2 ring-indigo-500/30";
      case "warning":
        return "border-amber-500/40 bg-amber-500/10 text-amber-300";
      case "returned":
        return "border-rose-500/40 bg-rose-500/10 text-rose-300";
      default:
        return "border-zinc-800 bg-zinc-900 text-zinc-500";
    }
  };

  const expectedCod = Number(
    activeDispatch?.expected_cod ??
      activeDispatch?.amount_to_collect ??
      order.total_price ??
      0
  );
  const actualCod =
    activeDispatch?.actual_cod_collected !== null &&
    activeDispatch?.actual_cod_collected !== undefined
      ? Number(activeDispatch.actual_cod_collected)
      : null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold text-white">Pathao Courier Status & Tracking</h2>
          <span className="text-xs font-mono font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
            {consignmentId}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncWithCourier}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-colors disabled:opacity-50"
            title="Scan Pathao API for this consignment"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-indigo-400" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync with Pathao"}
          </button>

          <a
            href={trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold transition-colors"
          >
            Track on Pathao <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* 5-Stage Visual Status Timeline */}
      <div className="py-2">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 relative">
          {steps.map((step, idx) => {
            const isCompleted = step.state === "completed";
            const isCurrent = step.state === "current";
            const isWarn = step.state === "warning";
            const isReturned = step.state === "returned";

            return (
              <div
                key={step.id}
                className={`flex flex-col p-3 rounded-xl border transition-all ${getStepBorderColor(
                  step.state
                )}`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider opacity-60">
                    Stage {idx + 1}
                  </span>
                  <div className="flex items-center justify-center w-5 h-5 rounded-full bg-zinc-950/60 border border-zinc-800/80">
                    {getStepIcon(step.state)}
                  </div>
                </div>

                <p className="text-xs font-bold leading-tight text-zinc-100">
                  {step.label}
                </p>

                {step.subtitle && (
                  <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">
                    {step.subtitle}
                  </p>
                )}

                {step.timestamp && (
                  <p className="text-[10px] font-mono text-zinc-400 mt-2 pt-1 border-t border-zinc-800/60">
                    {formatBstDate(step.timestamp)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Courier Details Card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs">
        <div>
          <span className="text-zinc-500 block text-[11px]">Courier / Service</span>
          <span className="font-semibold text-zinc-200">Pathao Courier Bangladesh</span>
        </div>

        <div>
          <span className="text-zinc-500 block text-[11px]">Merchant Order ID</span>
          <span className="font-mono font-semibold text-zinc-200">
            {activeDispatch?.merchant_order_id || order.shopify_order_name}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block text-[11px]">Dispatched At</span>
          <span className="font-mono text-zinc-300">
            {formatBstDate(activeDispatch?.dispatched_at || order.created_at) || "—"}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block text-[11px]">Delivery / Outcome Date</span>
          <span className="font-mono text-zinc-300">
            {formatBstDate(
              activeDispatch?.delivered_at ||
                activeDispatch?.returned_to_merchant_at ||
                order.delivered_at
            ) || "In Progress"}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block text-[11px]">Expected COD</span>
          <span className="font-mono font-semibold text-zinc-200">
            ৳{expectedCod.toLocaleString()}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block text-[11px]">Actual COD Collected</span>
          <span
            className={`font-mono font-semibold ${
              actualCod !== null ? "text-emerald-400" : "text-zinc-500"
            }`}
          >
            {actualCod !== null ? `৳${actualCod.toLocaleString()}` : "Pending"}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block text-[11px]">Delivery Fee</span>
          <span className="font-mono text-zinc-300">
            ৳{Number(activeDispatch?.delivery_fee || order.delivery_charge || 0).toLocaleString()}
          </span>
        </div>

        <div>
          <span className="text-zinc-500 block text-[11px]">Return Charge</span>
          <span className="font-mono text-zinc-300">
            ৳{Number(activeDispatch?.return_charge || 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

