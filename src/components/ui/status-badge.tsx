"use client";

import type { OrderStatus } from "@/types/database";

const STATUS_STYLES: Record<string, string> = {
  pending: "status-pending",
  preparing: "status-preparing",
  in_progress: "status-preparing",
  partial: "status-preparing",
  partially_fulfilled: "status-preparing",
  dispatched: "status-dispatched",
  fulfilled: "status-dispatched",
  delivered: "status-delivered",
  partial_delivery: "status-partial-delivery",
  hold: "status-hold",
  on_hold: "status-hold",
  cancelled: "status-cancelled",
  delayed: "status-delayed",
  returned: "status-returned",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  preparing: "Preparing",
  in_progress: "Preparing",
  partial: "Preparing",
  partially_fulfilled: "Preparing",
  dispatched: "Dispatched",
  fulfilled: "Dispatched",
  delivered: "Delivered",
  partial_delivery: "Partial Delivery",
  hold: "On Hold",
  on_hold: "On Hold",
  cancelled: "Cancelled",
  delayed: "Delayed",
  returned: "Returned",
};

import { getOrderDisplayStatus } from "@/lib/order-status";
export { getOrderDisplayStatus };

interface StatusBadgeProps {
  status: OrderStatus | string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const normalizedStatus = (status || "pending").toLowerCase();
  const style = STATUS_STYLES[normalizedStatus] || "status-pending";
  const label = STATUS_LABELS[normalizedStatus] || status || "Pending";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${style} ${
        size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1"
      }`}
    >
      {label}
    </span>
  );
}

export function ShopifyFinancialBadge({ status }: { status: string }) {
  if (!status) return null;
  const s = status.toLowerCase();
  
  let bg = "bg-zinc-800/50";
  let text = "text-zinc-300";
  let dot = "bg-zinc-500";
  let label = status;

  if (s === "paid") {
    bg = "bg-emerald-500/10";
    text = "text-emerald-500";
    dot = "bg-emerald-500";
    label = "Paid";
  } else if (s === "pending" || s === "partially_paid") {
    bg = "bg-amber-500/15";
    text = "text-amber-500";
    dot = "bg-amber-500";
    label = s === "pending" ? "Payment pending" : "Partially paid";
  } else if (s === "voided" || s === "refunded") {
    bg = "bg-zinc-500/15";
    text = "text-zinc-400";
    dot = "bg-zinc-500";
    label = s === "voided" ? "Voided" : "Refunded";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${bg} ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
      {label}
    </span>
  );
}

export function ShopifyFulfillmentBadge({
  status,
  currentStatus,
}: {
  status: string;
  currentStatus?: string;
}) {
  if (!status) return null;
  const s = status.toLowerCase();
  const cs = (currentStatus || "").toLowerCase();

  const isTerminalOrDispatched = ["dispatched", "delivered", "returned", "cancelled"].includes(cs);

  let bg = "bg-zinc-800/50";
  let text = "text-zinc-300";
  let dot = "bg-zinc-500";
  let label = status;

  if (s === "unfulfilled") {
    bg = "bg-yellow-500/15";
    text = "text-yellow-500";
    dot = "bg-yellow-500";
    label = "Unfulfilled";
  } else if (s === "in_progress" || s === "partial" || s === "partially_fulfilled") {
    if (isTerminalOrDispatched) {
      bg = "bg-zinc-800/50";
      text = "text-zinc-400";
      dot = "bg-zinc-500";
      label = "Shopify: In progress";
    } else {
      bg = "bg-amber-500/15";
      text = "text-amber-500";
      dot = "bg-amber-500";
      label = "Preparing";
    }
  } else if (s === "fulfilled") {
    bg = "bg-zinc-500/15";
    text = "text-zinc-400";
    dot = "bg-zinc-500";
    label = "Fulfilled";
  } else if (s === "on_hold" || s === "hold") {
    bg = "bg-orange-500/15 border border-orange-500/25";
    text = "text-orange-400";
    dot = "bg-orange-400 animate-pulse";
    label = "On hold";
  } else if (s === "not_required") {
    bg = "bg-zinc-500/15";
    text = "text-zinc-400";
    dot = "bg-zinc-500";
    label = "Not required";
  }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${bg} ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`}></span>
      {label}
    </span>
  );
}
