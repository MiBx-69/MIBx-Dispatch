import { describe, it, expect } from "vitest";

describe("Dispatch Flow & Logic Tests", () => {
  describe("Amount to Collect & Shipping Charge Resolution", () => {
    it("correctly falls back to order total if amount_to_collect is null or omitted", () => {
      const orderTotalPrice = 1500;
      const amountToCollectInput = null;

      const finalAmount = amountToCollectInput !== undefined && amountToCollectInput !== null
        ? Number(amountToCollectInput)
        : Number(orderTotalPrice);

      expect(finalAmount).toBe(1500);
    });

    it("respects explicit amount_to_collect when partial payment was already received", () => {
      const orderTotalPrice = 2000;
      const amountToCollectInput = 500;

      const finalAmount = amountToCollectInput !== undefined && amountToCollectInput !== null
        ? Number(amountToCollectInput)
        : Number(orderTotalPrice);

      expect(finalAmount).toBe(500);
    });

    it("handles 0 amount to collect for pre-paid online orders", () => {
      const orderTotalPrice = 2500;
      const amountToCollectInput = 0;

      const finalAmount = amountToCollectInput !== undefined && amountToCollectInput !== null
        ? Number(amountToCollectInput)
        : Number(orderTotalPrice);

      expect(finalAmount).toBe(0);
    });
  });

  describe("Duplicate Consignment & Active Dispatch Protection", () => {
    function canDispatchOrder(order: {
      internal_status: string;
      pathao_consignment_id: string | null;
      pathao_delivery_status: string | null;
    }, force = false): { allowed: boolean; reason?: string } {
      if (order.internal_status === "cancelled") {
        return { allowed: false, reason: "Order is cancelled" };
      }

      if (
        order.pathao_consignment_id &&
        !["Cancelled", "Return Completed", "Failed"].includes(order.pathao_delivery_status || "") &&
        !force
      ) {
        return {
          allowed: false,
          reason: `Order already dispatched with active consignment ${order.pathao_consignment_id}`,
        };
      }

      return { allowed: true };
    }

    it("rejects dispatching cancelled orders", () => {
      const result = canDispatchOrder({
        internal_status: "cancelled",
        pathao_consignment_id: null,
        pathao_delivery_status: null,
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Order is cancelled");
    });

    it("rejects dispatching orders that already have an active consignment", () => {
      const result = canDispatchOrder({
        internal_status: "dispatched",
        pathao_consignment_id: "PT12345678",
        pathao_delivery_status: "In Transit",
      });
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("already dispatched with active consignment");
    });

    it("allows redispatching if prior consignment was Cancelled", () => {
      const result = canDispatchOrder({
        internal_status: "preparing",
        pathao_consignment_id: "PT99999999",
        pathao_delivery_status: "Cancelled",
      });
      expect(result.allowed).toBe(true);
    });

    it("allows force redispatch if caller explicitly specifies force=true", () => {
      const result = canDispatchOrder(
        {
          internal_status: "dispatched",
          pathao_consignment_id: "PT12345678",
          pathao_delivery_status: "In Transit",
        },
        true // force
      );
      expect(result.allowed).toBe(true);
    });
  });
});
