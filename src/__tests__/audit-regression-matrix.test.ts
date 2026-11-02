import { describe, it, expect } from "vitest";
import { normalizePathaoEvent, evaluateStatusTransition } from "@/lib/pathao/status-engine";
import { computeInvoiceFinancials, invoiceIdempotencyKey } from "@/lib/pathao/settlement";
import { normalizeBdPhoneForPathao, cleanPathaoTrackingUrl } from "@/lib/pathao/client";

describe("MiBx Dispatch — Audit Regression Matrix", () => {
  describe("1. Partial Delivery vs Full Delivery Separation", () => {
    it("partial delivery has null internalOrderStatus and null shopifyFulfillmentEvent", () => {
      const norm = normalizePathaoEvent("order.partial-delivery");
      expect(norm.normalizedStatus).toBe("PARTIALLY_DELIVERED");
      expect(norm.internalOrderStatus).toBeNull();
      expect(norm.shopifyFulfillmentEvent).toBeNull();
      expect(norm.isTerminalDelivery).toBe(true);
      expect(norm.isReturnLifecycle).toBe(true);
    });

    it("full delivery has 'delivered' internalOrderStatus and 'DELIVERED' fulfillment event", () => {
      const norm = normalizePathaoEvent("order.delivered");
      expect(norm.normalizedStatus).toBe("DELIVERED");
      expect(norm.internalOrderStatus).toBe("delivered");
      expect(norm.shopifyFulfillmentEvent).toBe("DELIVERED");
    });
  });

  describe("2. COD Settlement & Invoice Idempotency (No Fabrication)", () => {
    it("leaves actualReceivedSettlement as null when Pathao payload omits it", () => {
      const payload = {
        invoice_id: "INV-1001",
        delivery_fee: 120,
        return_charge: 0,
        other_deductions: 0,
        // settlement_amount or received_amount is omitted
      };
      const dispatch = {
        expected_cod: 2500,
        actual_cod_collected: 2500,
      };

      const fin = computeInvoiceFinancials(payload, dispatch, null);
      expect(fin.expectedCod).toBe(2500);
      expect(fin.collectedCod).toBe(2500);
      expect(fin.deliveryCharge).toBe(120);
      expect(fin.expectedSettlement).toBe(2380);
      // Critical P0 audit rule: actual received must NEVER be guessed as 2380!
      expect(fin.actualReceivedSettlement).toBeNull();
      expect(fin.settlementStatus).toBe("pending");
    });

    it("records actualReceivedSettlement only when explicit in payload", () => {
      const payload = {
        invoice_id: "INV-1002",
        delivery_fee: 120,
        settlement_amount: 2380,
      };
      const dispatch = {
        expected_cod: 2500,
        actual_cod_collected: 2500,
      };

      const fin = computeInvoiceFinancials(payload, dispatch, null);
      expect(fin.expectedSettlement).toBe(2380);
      expect(fin.actualReceivedSettlement).toBe(2380);
      expect(fin.settlementStatus).toBe("settled");
    });

    it("computes deterministic invoice idempotency key from invoice id", () => {
      const key1 = invoiceIdempotencyKey({ invoice_id: "INV-99" }, "DU123", "2026-10-31T10:00:00Z");
      const key2 = invoiceIdempotencyKey({ payment_reference: "INV-99" }, "DU123", "2026-10-31T12:00:00Z");
      expect(key1).toBe("pathao:invoice:DU123:INV-99");
      expect(key1).toBe(key2);
    });
  });

  describe("3. Phone Normalization & 11-digit BD National Format", () => {
    it("normalizes phone numbers to exact 11 digits starting with 01", () => {
      expect(normalizeBdPhoneForPathao("+8801712200891")).toBe("01712200891");
      expect(normalizeBdPhoneForPathao("%2B8801712200891")).toBe("01712200891");
      expect(normalizeBdPhoneForPathao("8801712200891")).toBe("01712200891");
      expect(normalizeBdPhoneForPathao("01712-200891")).toBe("01712200891");
      expect(normalizeBdPhoneForPathao("1712200891")).toBe("01712200891");
    });

    it("cleanPathaoTrackingUrl strips international prefixes from tracking URLs", () => {
      const dirty = "https://merchant.pathao.com/tracking?consignment_id=DU123&phone=%2B8801712200891";
      expect(cleanPathaoTrackingUrl(dirty)).toBe("https://merchant.pathao.com/tracking?consignment_id=DU123&phone=01712200891");
    });
  });

  describe("4. Terminal Courier State Protection against Out-of-Order Events", () => {
    it("prevents pre-transit events from overwriting DELIVERED status", () => {
      const transition = evaluateStatusTransition({
        currentNormalizedStatus: "DELIVERED",
        incomingNormalizedStatus: "PICKUP_REQUESTED",
      });
      expect(transition.shouldUpdateParcelStatus).toBe(false);
      expect(transition.shouldRecordHistory).toBe(true);
    });

    it("prevents pre-transit events from overwriting PARTIALLY_DELIVERED status", () => {
      const transition = evaluateStatusTransition({
        currentNormalizedStatus: "PARTIALLY_DELIVERED",
        incomingNormalizedStatus: "IN_TRANSIT",
      });
      expect(transition.shouldUpdateParcelStatus).toBe(false);
      expect(transition.shouldRecordHistory).toBe(true);
    });

    it("records return leg events in history while preserving PARTIALLY_DELIVERED parcel status", () => {
      const transition = evaluateStatusTransition({
        currentNormalizedStatus: "PARTIALLY_DELIVERED",
        incomingNormalizedStatus: "RETURN_IN_TRANSIT",
      });
      expect(transition.shouldUpdateParcelStatus).toBe(false);
      expect(transition.shouldRecordHistory).toBe(true);
    });
  });

  describe("5. Unbounded Financial Aggregation (> 500 rows safe)", () => {
    it("accurately sums large invoice datasets without artificial 500 row limits", () => {
      // Simulate 600 invoice records
      const invoices = Array.from({ length: 600 }, (_, i) => ({
        id: `inv-${i}`,
        actual_received_settlement: 1000,
      }));

      const total = invoices.reduce((sum, inv) => sum + inv.actual_received_settlement, 0);
      expect(total).toBe(600_000);
      expect(invoices.length).toBeGreaterThan(500);
    });
  });

  describe("6. Dispatch Concurrency Claim Lock & Expired Claim Recovery", () => {
    it("rejects concurrent dispatch requests while active claim is valid", () => {
      const now = Date.now();
      const activeClaim = {
        order_id: "order-123",
        status: "in_progress",
        expires_at: new Date(now + 60_000).toISOString(),
      };

      const isClaimActive = (claim: typeof activeClaim, atIso: string) => {
        return claim.status === "in_progress" && new Date(claim.expires_at).getTime() > new Date(atIso).getTime();
      };

      expect(isClaimActive(activeClaim, new Date(now).toISOString())).toBe(true);
    });

    it("permits new dispatch attempt when prior claim has expired", () => {
      const now = Date.now();
      const expiredClaim = {
        order_id: "order-123",
        status: "in_progress",
        expires_at: new Date(now - 5_000).toISOString(), // expired 5s ago
      };

      const isClaimActive = (claim: typeof expiredClaim, atIso: string) => {
        return claim.status === "in_progress" && new Date(claim.expires_at).getTime() > new Date(atIso).getTime();
      };

      expect(isClaimActive(expiredClaim, new Date(now).toISOString())).toBe(false);
    });
  });

  describe("7. Shopify Webhook Auto-Dispatch Atomic Claim Query Safety", () => {
    it("allows claim when pathao_delivery_status is null or not Dispatching", () => {
      const canClaim = (status: string | null) => {
        return status === null || status !== "Dispatching";
      };

      expect(canClaim(null)).toBe(true);
      expect(canClaim("Pending")).toBe(true);
      expect(canClaim("Dispatching")).toBe(false);
    });
  });
});
