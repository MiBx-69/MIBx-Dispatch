import type { OrderStatus } from "@/types/database";

export function getOrderDisplayStatus(order: {
  internal_status?: string | null;
  fulfillment_status?: string | null;
  cancel_reason?: string | null;
  pathao_consignment_id?: string | null;
  delivered_at?: string | null;
  pathao_delivery_status?: string | null;
}): OrderStatus | string {
  if (order.internal_status === "cancelled" || order.cancel_reason) return "cancelled";
  if (order.internal_status === "returned") return "returned";
  if (order.internal_status === "delivered" || Boolean(order.delivered_at)) return "delivered";
  if (order.internal_status === "dispatched" || !!order.pathao_consignment_id) return "dispatched";
  if (
    order.internal_status === "hold" ||
    order.fulfillment_status === "on_hold" ||
    order.fulfillment_status === "hold"
  ) {
    return "hold";
  }
  if (
    order.internal_status === "preparing" ||
    order.fulfillment_status === "in_progress" ||
    order.fulfillment_status === "partial" ||
    order.fulfillment_status === "partially_fulfilled"
  ) {
    return "preparing";
  }
  if (order.internal_status === "delayed") return "delayed";
  return order.internal_status || "pending";
}
