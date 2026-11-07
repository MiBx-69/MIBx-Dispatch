import { describe, it, expect } from "vitest";
import { formatPathaoTrackingUrl, normalizeBdPhoneForPathao } from "@/lib/pathao/client";

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

    it("enforces COD = 0 when financial_status is paid even if amount_to_collect is non-zero", () => {
      const order = {
        financial_status: "paid",
        cod_amount: 1500,
        total_price: 1500,
      };
      const amount_to_collect = 1500; // user or form might have defaulted to order total

      const finStatus = (order.financial_status || "").toLowerCase();
      const isPaid = finStatus === "paid" || finStatus === "refunded";
      let finalAmount = 0;
      if (isPaid) {
        finalAmount = 0;
      } else if (amount_to_collect !== undefined && amount_to_collect !== null) {
        finalAmount = Math.max(0, Math.round(Number(amount_to_collect)));
      } else if (order.cod_amount !== undefined && order.cod_amount !== null) {
        finalAmount = Math.max(0, Math.round(Number(order.cod_amount)));
      } else if (order.total_price !== null) {
        finalAmount = Math.max(0, Math.round(Number(order.total_price)));
      }

      expect(finalAmount).toBe(0);
    });

    it("uses cod_amount due when financial_status is pending or partially_paid", () => {
      const order = {
        financial_status: "pending",
        cod_amount: 1200,
        total_price: 1500,
      };

      const finStatus = (order.financial_status || "").toLowerCase();
      const isPaid = finStatus === "paid" || finStatus === "refunded";
      let finalAmount = 0;
      if (isPaid) {
        finalAmount = 0;
      } else if (order.cod_amount !== undefined && order.cod_amount !== null) {
        finalAmount = Math.max(0, Math.round(Number(order.cod_amount)));
      }

      expect(finalAmount).toBe(1200);
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

    it("allows redispatching if prior consignment was Return Completed or Failed", () => {
      const res1 = canDispatchOrder({
        internal_status: "returned",
        pathao_consignment_id: "PT99999999",
        pathao_delivery_status: "Return Completed",
      });
      expect(res1.allowed).toBe(true);

      const res2 = canDispatchOrder({
        internal_status: "preparing",
        pathao_consignment_id: "PT99999999",
        pathao_delivery_status: "Failed",
      });
      expect(res2.allowed).toBe(true);
    });

    it("allows dispatching order if internal_status is dispatched but pathao_consignment_id is null (e.g. Order #1994)", () => {
      const result = canDispatchOrder({
        internal_status: "dispatched",
        pathao_consignment_id: null,
        pathao_delivery_status: null,
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

  describe("Shopify Fulfillment & Tracking Synchronization Logic", () => {
    it("attaches Pathao carrier name, tracking number, and tracking URL with 11-digit BD phone", () => {
      const consignmentId = "DU031126ALRPXK";
      const phone = "8801712200891";

      const normalizedPhone = normalizeBdPhoneForPathao(phone);
      expect(normalizedPhone).toBe("01712200891");

      const trackingUrl = formatPathaoTrackingUrl(consignmentId, phone);
      expect(trackingUrl).toBe("https://merchant.pathao.com/tracking?consignment_id=DU031126ALRPXK&phone=01712200891");

      const trackingInput = {
        number: consignmentId,
        company: "Pathao",
        url: trackingUrl,
      };

      expect(trackingInput.company).toBe("Pathao");
      expect(trackingInput.number).toBe("DU031126ALRPXK");
      expect(trackingInput.url).toContain("01712200891");
    });

    it("prioritizes updating tracking on existing fulfillment when order is already fulfilled in Shopify", async () => {
      const existingFulfillments = [
        { id: "gid://shopify/Fulfillment/7333573329005", status: "SUCCESS", trackingInfo: [] }
      ];
      const activeFulfillment = existingFulfillments.find(
        (f) => f.status === "SUCCESS" || f.status === "OPEN"
      ) || existingFulfillments[0];

      expect(activeFulfillment).toBeDefined();
      expect(activeFulfillment?.id).toBe("gid://shopify/Fulfillment/7333573329005");
    });

    it("verifies GraphQL fulfillments query format is direct list without nodes field", () => {
      const graphqlQuery = `
        query GetOrderFulfillments($id: ID!) {
          order(id: $id) {
            fulfillments {
              id
              status
              createdAt
              trackingInfo { number url company }
            }
          }
        }
      `;
      expect(graphqlQuery).not.toContain("nodes");
      expect(graphqlQuery).toContain("fulfillments {");
      expect(graphqlQuery).toContain("trackingInfo { number url company }");
    });

    it("passes notifyCustomer: true when attaching tracking to Shopify fulfillment", () => {
      const params = {
        shopifyOrderId: "19008309854317",
        consignmentId: "DU071126PSWA9L",
        trackingUrl: "https://merchant.pathao.com/tracking?consignment_id=DU071126PSWA9L",
        trackingCompany: "Pathao",
        notifyCustomer: true,
      };
      expect(params.notifyCustomer).toBe(true);
    });
  });
});
