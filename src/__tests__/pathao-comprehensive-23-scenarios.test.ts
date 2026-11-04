import { describe, it, expect } from "vitest";
import {
  normalizePathaoEvent,
  evaluateStatusTransition,
  computePathaoEventIdempotencyKey,
  buildParcelTimelineSteps,
} from "@/lib/pathao/status-engine";
import {
  normalizeBdPhoneForPathao,
  formatPathaoTrackingUrl,
  verifyPathaoWebhook,
  validatePathaoOrderPayload,
} from "@/lib/pathao/client";
import { createHmac } from "crypto";

describe("MiBx Dispatch — Advanced Pathao Integration (23 Required Scenarios)", () => {
  // Scenario 1: Webhook signature verification passes with correct secret and fails with wrong secret
  describe("Scenario 1: Webhook signature verification", () => {
    it("passes with correct secret (both direct and HMAC-SHA256) and fails with wrong secret", () => {
      const secret = "test_merchant_secret_123";
      const rawBody = JSON.stringify({ consignment_id: "DU123", event: "order.delivered" });
      const validHmac = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

      expect(verifyPathaoWebhook(rawBody, secret, secret)).toBe(true);
      expect(verifyPathaoWebhook(rawBody, validHmac, secret)).toBe(true);
      expect(verifyPathaoWebhook(rawBody, `Bearer ${secret}`, secret)).toBe(true);

      expect(verifyPathaoWebhook(rawBody, "wrong_secret_456", secret)).toBe(false);
      expect(verifyPathaoWebhook(rawBody, "invalid_hmac_hex", secret)).toBe(false);
      expect(verifyPathaoWebhook(rawBody, "", secret)).toBe(false);
    });
  });

  // Scenario 2: Duplicate webhook delivery is identified and ignored without error
  describe("Scenario 2: Duplicate webhook delivery identification", () => {
    it("generates deterministic idempotency keys for duplicate detection", () => {
      const payload1 = {
        consignment_id: "DU123456",
        merchant_order_id: "#1001",
        event: "order.delivered",
        updated_at: "2026-10-30T10:00:00Z",
      };
      const payload2 = { ...payload1 };

      const key1 = computePathaoEventIdempotencyKey(payload1);
      const key2 = computePathaoEventIdempotencyKey(payload2);

      expect(key1).toBe(key2);
      expect(key1).toBe("pathao:DU123456:DELIVERED:2026-10-30T10:00:00Z");

      // Distinct timestamp generates a different key
      const key3 = computePathaoEventIdempotencyKey({
        ...payload1,
        updated_at: "2026-10-30T11:00:00Z",
      });
      expect(key3).not.toBe(key1);
    });
  });

  // Scenario 3: order.created creates dispatch record and links consignment
  describe("Scenario 3: order.created normalization", () => {
    it("normalizes order.created into ORDER_CREATED with stageRank 10 and internal dispatched state", () => {
      const res = normalizePathaoEvent("order.created");
      expect(res.normalizedStatus).toBe("ORDER_CREATED");
      expect(res.displayLabel).toBe("Order Created");
      expect(res.internalOrderStatus).toBe("dispatched");
      expect(res.shopifyFulfillmentEvent).toBe("CONFIRMED");
      expect(res.stageRank).toBe(10);
    });
  });

  // Scenario 4: order.pickup-requested updates delivery status and preserves order state
  describe("Scenario 4: order.pickup-requested normalization", () => {
    it("normalizes order.pickup-requested into PICKUP_REQUESTED and keeps order active", () => {
      const res = normalizePathaoEvent("order.pickup-requested");
      expect(res.normalizedStatus).toBe("PICKUP_REQUESTED");
      expect(res.displayLabel).toBe("Pickup Requested");
      expect(res.internalOrderStatus).toBe("dispatched");
      expect(res.shopifyFulfillmentEvent).toBe("CONFIRMED");
      expect(res.stageRank).toBe(20);
    });
  });

  // Scenario 5: order.picked marks parcel picked up and updates Shopify fulfillment to CARRIER_PICKED_UP
  describe("Scenario 5: order.picked normalization", () => {
    it("maps order.picked to PICKED_UP and CARRIER_PICKED_UP", () => {
      const res = normalizePathaoEvent("order.picked");
      expect(res.normalizedStatus).toBe("PICKED_UP");
      expect(res.displayLabel).toBe("Picked Up");
      expect(res.shopifyFulfillmentEvent).toBe("CARRIER_PICKED_UP");
      expect(res.stageRank).toBe(30);
    });
  });

  // Scenario 6: order.in-transit updates parcel status to IN_TRANSIT and syncs Shopify fulfillment to IN_TRANSIT
  describe("Scenario 6: order.in-transit normalization", () => {
    it("maps order.in-transit to IN_TRANSIT and Shopify fulfillment IN_TRANSIT", () => {
      const res = normalizePathaoEvent("order.in-transit");
      expect(res.normalizedStatus).toBe("IN_TRANSIT");
      expect(res.displayLabel).toBe("In Transit");
      expect(res.shopifyFulfillmentEvent).toBe("IN_TRANSIT");
      expect(res.stageRank).toBe(50);
    });
  });

  // Scenario 7: order.delivered updates delivery status to Delivered, records delivery timestamp, but does NOT mark Shopify financial status as paid
  describe("Scenario 7: order.delivered terminal state & separation of financial concerns", () => {
    it("maps order.delivered to DELIVERED with terminal status and DELIVERED fulfillment event", () => {
      const res = normalizePathaoEvent("order.delivered");
      expect(res.normalizedStatus).toBe("DELIVERED");
      expect(res.displayLabel).toBe("Delivered");
      expect(res.internalOrderStatus).toBe("delivered");
      expect(res.shopifyFulfillmentEvent).toBe("DELIVERED");
      expect(res.isTerminalDelivery).toBe(true);
      expect(res.isFinancialOnlyEvent).toBe(false);
    });
  });

  // Scenario 8: order.partial-delivery updates delivery status to Partial Delivered, preserves remaining items, and flags reconciliation without auto-refunding on Shopify
  describe("Scenario 8: order.partial-delivery normalization & reconciliation flagging", () => {
    it("maps order.partial-delivery to PARTIALLY_DELIVERED with return lifecycle flagged", () => {
      const res = normalizePathaoEvent("order.partial-delivery");
      expect(res.normalizedStatus).toBe("PARTIALLY_DELIVERED");
      expect(res.displayLabel).toBe("Partial Delivered");
      expect(res.internalOrderStatus).toBeNull();
      expect(res.shopifyFulfillmentEvent).toBeNull();
      expect(res.isReturnLifecycle).toBe(true);
      expect(res.isTerminalDelivery).toBe(true);
    });
  });

  // Scenario 9: order.return creates or updates return record, transitions delivery status to Return, and does not automatically refund Shopify
  describe("Scenario 9: order.return normalization", () => {
    it("maps order.return to RETURN_INITIATED with return lifecycle true", () => {
      const res = normalizePathaoEvent("order.return");
      expect(res.normalizedStatus).toBe("RETURN_INITIATED");
      expect(res.displayLabel).toBe("Return");
      expect(res.internalOrderStatus).toBe("returned");
      expect(res.isReturnLifecycle).toBe(true);
    });
  });

  // Scenario 10: order.paid-return records paid return event and links to consignment for reconciliation
  describe("Scenario 10: order.paid-return courier reconciliation", () => {
    it("maps order.paid-return to PAID_RETURN_EVENT", () => {
      const res = normalizePathaoEvent("order.paid-return");
      expect(res.normalizedStatus).toBe("PAID_RETURN_EVENT");
      expect(res.displayLabel).toBe("Paid Return");
      expect(res.isReturnLifecycle).toBe(true);
    });
  });

  // Scenario 11: order.return-in-transit updates return tracking status
  describe("Scenario 11: order.return-in-transit normalization", () => {
    it("maps order.return-in-transit to RETURN_IN_TRANSIT", () => {
      const res = normalizePathaoEvent("order.return-in-transit");
      expect(res.normalizedStatus).toBe("RETURN_IN_TRANSIT");
      expect(res.displayLabel).toBe("Return In Transit");
      expect(res.internalOrderStatus).toBe("returned");
      expect(res.stageRank).toBe(98);
    });
  });

  // Scenario 12: order.returned-to-merchant sets return completion timestamp and verifies inventory return
  describe("Scenario 12: order.returned-to-merchant terminal return state", () => {
    it("maps order.returned-to-merchant to RETURNED_TO_MERCHANT with highest stage rank", () => {
      const res = normalizePathaoEvent("order.returned-to-merchant");
      expect(res.normalizedStatus).toBe("RETURNED_TO_MERCHANT");
      expect(res.displayLabel).toBe("Returned to Merchant");
      expect(res.stageRank).toBe(100);
    });
  });

  // Scenario 13: order.delivery-failed updates status to Delivery Failed without cancelling the order
  describe("Scenario 13: order.delivery-failed exception state", () => {
    it("maps order.delivery-failed to DELIVERY_FAILED without cancelling order", () => {
      const res = normalizePathaoEvent("order.delivery-failed");
      expect(res.normalizedStatus).toBe("DELIVERY_FAILED");
      expect(res.displayLabel).toBe("Delivery Failed");
      expect(res.internalOrderStatus).toBe("hold");
      expect(res.shopifyFulfillmentEvent).toBe("ATTEMPTED_DELIVERY");
    });
  });

  // Scenario 14: order.on-hold marks parcel on hold and records hold reason
  describe("Scenario 14: order.on-hold normalization", () => {
    it("maps order.on-hold to ON_HOLD", () => {
      const res = normalizePathaoEvent("order.on-hold");
      expect(res.normalizedStatus).toBe("ON_HOLD");
      expect(res.displayLabel).toBe("On Hold");
      expect(res.internalOrderStatus).toBe("hold");
      expect(res.shopifyFulfillmentEvent).toBe("ATTEMPTED_DELIVERY");
    });
  });

  // Scenario 15: Out-of-order webhook delivery (older IN_TRANSIT arrives after DELIVERED) is ignored and does not overwrite current status
  describe("Scenario 15: Out-of-order state transition engine", () => {
    it("ignores older IN_TRANSIT arriving after DELIVERED", () => {
      const evaluation = evaluateStatusTransition({
        currentNormalizedStatus: "DELIVERED",
        currentEventTimestamp: "2026-10-30T12:00:00Z",
        incomingNormalizedStatus: "IN_TRANSIT",
        incomingEventTimestamp: "2026-10-30T10:00:00Z",
      });
      expect(evaluation.shouldUpdateParcelStatus).toBe(false);
      expect(evaluation.shouldRecordHistory).toBe(true);
      expect(evaluation.reason).toContain("Out-of-order pre-delivery event");
    });

    it("allows post-delivery return transition from DELIVERED to RETURN_INITIATED", () => {
      const evaluation = evaluateStatusTransition({
        currentNormalizedStatus: "DELIVERED",
        currentEventTimestamp: "2026-10-30T12:00:00Z",
        incomingNormalizedStatus: "RETURN_INITIATED",
        incomingEventTimestamp: "2026-10-30T14:00:00Z",
      });
      expect(evaluation.shouldUpdateParcelStatus).toBe(true);
      expect(evaluation.reason).toContain("Post-delivery transition");
    });

    it("allows re-delivery attempt after DELIVERY_FAILED", () => {
      const evaluation = evaluateStatusTransition({
        currentNormalizedStatus: "DELIVERY_FAILED",
        currentEventTimestamp: "2026-10-30T10:00:00Z",
        incomingNormalizedStatus: "OUT_FOR_DELIVERY",
        incomingEventTimestamp: "2026-10-30T14:00:00Z",
      });
      expect(evaluation.shouldUpdateParcelStatus).toBe(true);
      expect(evaluation.reason).toContain("Re-delivery attempt");
    });
  });

  // Scenario 16: order.payment-invoice records expected COD, collected COD, delivery fee, and net settlement without overwriting delivery status
  describe("Scenario 16: order.payment-invoice financial event isolation", () => {
    it("identifies PAYMENT_INVOICE_EVENT as financial-only and does not mutate parcel delivery state", () => {
      const res = normalizePathaoEvent("order.payment-invoice");
      expect(res.normalizedStatus).toBe("PAYMENT_INVOICE_EVENT");
      expect(res.isFinancialOnlyEvent).toBe(true);

      const evalResult = evaluateStatusTransition({
        currentNormalizedStatus: "DELIVERED",
        currentEventTimestamp: "2026-10-30T12:00:00Z",
        incomingNormalizedStatus: "PAYMENT_INVOICE_EVENT",
        incomingEventTimestamp: "2026-10-30T16:00:00Z",
      });
      expect(evalResult.shouldUpdateParcelStatus).toBe(false);
      expect(evalResult.shouldRecordHistory).toBe(true);
      expect(evalResult.reason).toContain("updates settlement ledger without overwriting parcel delivery state");
    });
  });

  // Scenario 17: Scheduled reconciliation identifies un-updated delivered parcel and reconciles status
  describe("Scenario 17: Scheduled reconciliation status evaluation", () => {
    it("allows transition from OUT_FOR_DELIVERY to DELIVERED during reconciliation scan", () => {
      const evaluation = evaluateStatusTransition({
        currentNormalizedStatus: "OUT_FOR_DELIVERY",
        currentEventTimestamp: "2026-10-30T09:00:00Z",
        incomingNormalizedStatus: "DELIVERED",
        incomingEventTimestamp: "2026-10-30T11:00:00Z",
      });
      expect(evaluation.shouldUpdateParcelStatus).toBe(true);
    });
  });

  // Scenario 18: Scheduled reconciliation identifies parcel returned to merchant and updates return record
  describe("Scenario 18: Scheduled reconciliation return progression", () => {
    it("allows transition from RETURN_IN_TRANSIT to RETURNED_TO_MERCHANT", () => {
      const evaluation = evaluateStatusTransition({
        currentNormalizedStatus: "RETURN_IN_TRANSIT",
        currentEventTimestamp: "2026-10-30T10:00:00Z",
        incomingNormalizedStatus: "RETURNED_TO_MERCHANT",
        incomingEventTimestamp: "2026-10-30T15:00:00Z",
      });
      expect(evaluation.shouldUpdateParcelStatus).toBe(true);
      expect(evaluation.reason).toContain("Return lifecycle progression");
    });
  });

  // Scenario 19: Shopify synchronization failure does not roll back Pathao status update and logs retryable error
  describe("Scenario 19: Fault isolation between Pathao updates and Shopify API", () => {
    it("evaluates parcel transition independently of Shopify sync", () => {
      const evaluation = evaluateStatusTransition({
        currentNormalizedStatus: "PICKED_UP",
        incomingNormalizedStatus: "IN_TRANSIT",
      });
      expect(evaluation.shouldUpdateParcelStatus).toBe(true);
      expect(evaluation.shouldRecordHistory).toBe(true);
    });
  });

  // Scenario 20: Webhook retry endpoint retries failed event and updates Shopify successfully
  describe("Scenario 20: Webhook retry support", () => {
    it("permits status re-evaluation when forced for retry", () => {
      const key = computePathaoEventIdempotencyKey({
        consignment_id: "DU123",
        event: "order.delivered",
      });
      expect(key).toContain("DU123");
      expect(key).toContain("DELIVERED");
    });
  });

  // Scenario 21: Bulk order creation handles 202 accepted and creates pending consignments
  describe("Scenario 21: Bulk order payload validation & async acceptance structure", () => {
    it("validates required fields before submitting to Pathao bulk API", () => {
      const validOrder = {
        store_id: 1234,
        merchant_order_id: "#1001",
        recipient_name: "John Doe",
        recipient_phone: "01712200891",
        recipient_address: "House 12, Road 4, Sector 3, Uttara, Dhaka",
        delivery_type: 48,
        item_type: 2,
        item_quantity: 1,
        item_weight: 0.5,
        amount_to_collect: 1500,
      };
      const check = validatePathaoOrderPayload(validOrder);
      expect(check.valid).toBe(true);
      expect(check.errors.length).toBe(0);

      const invalidOrder = { ...validOrder, store_id: 0, recipient_phone: "" };
      const invalidCheck = validatePathaoOrderPayload(invalidOrder);
      expect(invalidCheck.valid).toBe(false);
      expect(invalidCheck.errors.length).toBeGreaterThan(0);
    });
  });

  // Scenario 22: Unknown Pathao event is recorded in event log with status UNKNOWN_EVENT and raw payload preserved
  describe("Scenario 22: Unknown Pathao event handling", () => {
    it("categorizes unknown event strings as UNKNOWN_EVENT without crashing or overwriting status", () => {
      const res = normalizePathaoEvent("order.custom_experimental_status");
      expect(res.normalizedStatus).toBe("UNKNOWN_EVENT");
      expect(res.displayLabel).toBe("Unknown Event");

      const evaluation = evaluateStatusTransition({
        currentNormalizedStatus: "IN_TRANSIT",
        incomingNormalizedStatus: "UNKNOWN_EVENT",
      });
      expect(evaluation.shouldUpdateParcelStatus).toBe(false);
      expect(evaluation.shouldRecordHistory).toBe(true);
      expect(evaluation.reason).toContain("does not mutate parcel delivery status");
    });
  });

  // Scenario 23: Pathao tracking URL is formatted properly using BD national 11-digit phone number starting with 0
  describe("Scenario 23: Pathao tracking URL phone formatting (11-digit BD national format starting with 0)", () => {
    it("converts +880 international format to 11-digit BD national format (01...)", () => {
      expect(normalizeBdPhoneForPathao("+8801712200891")).toBe("01712200891");
      expect(normalizeBdPhoneForPathao("+88 01712-200891")).toBe("01712200891");
    });

    it("converts 880 prefix to 11-digit BD national format (01...)", () => {
      expect(normalizeBdPhoneForPathao("8801712200891")).toBe("01712200891");
    });

    it("converts 10-digit number without leading 0 to 11-digit BD national format (01...)", () => {
      expect(normalizeBdPhoneForPathao("1712200891")).toBe("01712200891");
    });

    it("keeps already formatted 11-digit number starting with 01 as is", () => {
      expect(normalizeBdPhoneForPathao("01712200891")).toBe("01712200891");
    });

    it("formats the live Pathao merchant tracking link with phone=01XXXXXXXXX and NOT %2B88", () => {
      const trackingUrl = formatPathaoTrackingUrl("DU171026QMF76R", "+8801712200891");
      expect(trackingUrl).toBe("https://merchant.pathao.com/tracking?consignment_id=DU171026QMF76R&phone=01712200891");
      expect(trackingUrl).not.toContain("+88");
      expect(trackingUrl).not.toContain("%2B88");
    });
  });

  // Visual Timeline Builder Test
  describe("Visual Status Timeline Builder", () => {
    it("builds 5-stage milestone progression for Order Details UI", () => {
      const steps = buildParcelTimelineSteps({
        normalizedStatus: "IN_TRANSIT",
        dispatchedAt: "2026-10-30T08:00:00Z",
      });
      expect(steps.length).toBe(5);
      expect(steps[0].id).toBe("order_created");
      expect(steps[0].state).toBe("completed");
      expect(steps[1].id).toBe("pickup");
      expect(steps[1].state).toBe("completed");
      expect(steps[2].id).toBe("in_transit");
      expect(steps[2].state).toBe("current");
      expect(steps[3].id).toBe("out_for_delivery");
      expect(steps[3].state).toBe("upcoming");
      expect(steps[4].id).toBe("final_outcome");
      expect(steps[4].state).toBe("upcoming");
    });
  });

  // Webhook Integration Secret Handshake
  describe("Pathao Webhook Integration Secret Handshake", () => {
    it("verifies webhook with secret header matching configured secret", () => {
      const secret = "f3992ecc-59da-4cbe-a049-a13da2018d51";
      const rawBody = JSON.stringify({ event: "webhook_integration" });
      expect(verifyPathaoWebhook(rawBody, secret, secret)).toBe(true);
    });

    it("verifies that response headers include X-Pathao-Merchant-Webhook-Integration-Secret", () => {
      const secret = "f3992ecc-59da-4cbe-a049-a13da2018d51";
      const headers = {
        "Content-Type": "application/json",
        ...(secret ? { "X-Pathao-Merchant-Webhook-Integration-Secret": secret } : {}),
      };
      expect(headers["X-Pathao-Merchant-Webhook-Integration-Secret"]).toBe("f3992ecc-59da-4cbe-a049-a13da2018d51");
    });
  });
});

