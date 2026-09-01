"use client";

import type { OrderStatus } from "@/types/database";

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending: "status-pending",
  preparing: "status-preparing",
  dispatched: "status-dispatched",
  delivered: "status-delivered",
  hold: "status-hold",
  cancelled: "status-cancelled",
  delayed: "status-delayed",
  returned: "status-returned",
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  preparing: "Preparing",
  dispatched: "Dispatched",
  delivered: "Delivered",
  hold: "Hold",
  cancelled: "Cancelled",
  delayed: "Delayed",
  returned: "Returned",
};

interface StatusBadgeProps {
  status: OrderStatus | string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const style = STATUS_STYLES[status as OrderStatus] || "status-pending";
  const label = STATUS_LABELS[status as OrderStatus] || status;

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

export function ShopifyFulfillmentBadge({ status }: { status: string }) {
  if (!status) return null;
  const s = status.toLowerCase();
  
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
    bg = "bg-amber-500/15";
    text = "text-amber-500";
    dot = "bg-amber-500";
    label = "Preparing";
  } else if (s === "fulfilled") {
    bg = "bg-zinc-500/15";
    text = "text-zinc-400";
    dot = "bg-zinc-500";
    label = "Fulfilled";
  } else if (s === "on_hold" || s === "hold") {
    bg = "bg-amber-500/15";
    text = "text-amber-500";
    dot = "bg-amber-500";
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
