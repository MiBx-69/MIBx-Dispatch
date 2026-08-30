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
