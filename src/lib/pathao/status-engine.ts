/**
 * Centralized Pathao Event Normalization & Parcel Status Engine
 * Pure, client-safe TypeScript module (no next/headers dependency).
 */

export type NormalizedPathaoStatus =
  | "WEBHOOK_INTEGRATION"
  | "ORDER_CREATED"
  | "ORDER_UPDATED"
  | "PICKUP_REQUESTED"
  | "PICKUP_ASSIGNED"
  | "PICKED_UP"
  | "PICKUP_FAILED"
  | "PICKUP_CANCELLED"
  | "AT_SORTING_HUB"
  | "IN_TRANSIT"
  | "LAST_MILE_HUB"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "PARTIALLY_DELIVERED"
  | "RETURN_INITIATED"
  | "DELIVERY_FAILED"
  | "ON_HOLD"
  | "PAID_RETURN_EVENT"
  | "EXCHANGE"
  | "RETURN_ID_CREATED"
  | "RETURN_IN_TRANSIT"
  | "RETURNED_TO_MERCHANT"
  | "PAYMENT_INVOICE_EVENT"
  | "UNKNOWN_EVENT";

export type ShopifyFulfillmentEventType =
  | "CONFIRMED"
  | "CARRIER_PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "ATTEMPTED_DELIVERY"
  | "DELIVERED"
  | "FAILURE"
  | null;

export interface PathaoEventNormalizationResult {
  rawEvent: string;
  normalizedStatus: NormalizedPathaoStatus;
  displayLabel: string;
  internalOrderStatus:
    | "dispatched"
    | "delivered"
    | "returned"
    | "hold"
    | "cancelled"
    | null;
  shopifyFulfillmentEvent: ShopifyFulfillmentEventType;
  stageRank: number;
  isTerminalDelivery: boolean;
  isReturnLifecycle: boolean;
  isFinancialOnlyEvent: boolean;
}

const EXACT_EVENT_MAP: Record<string, NormalizedPathaoStatus> = {
  // Handshake
  webhook_integration: "WEBHOOK_INTEGRATION",
  "webhook.integration": "WEBHOOK_INTEGRATION",
  "order.webhook-integration": "WEBHOOK_INTEGRATION",

  // 1. Order Created / Updated
  "order.created": "ORDER_CREATED",
  order_created: "ORDER_CREATED",
  "order created": "ORDER_CREATED",
  pending: "ORDER_CREATED",

  "order.updated": "ORDER_UPDATED",
  order_updated: "ORDER_UPDATED",
  "order updated": "ORDER_UPDATED",
  updated: "ORDER_UPDATED",

  // 2. Pickup Lifecycle
  "order.pickup-requested": "PICKUP_REQUESTED",
  order_pickup_requested: "PICKUP_REQUESTED",
  "pickup requested": "PICKUP_REQUESTED",
  pickup_request: "PICKUP_REQUESTED",
  pickup_requested: "PICKUP_REQUESTED",

  "order.assigned-for-pickup": "PICKUP_ASSIGNED",
  order_assigned_for_pickup: "PICKUP_ASSIGNED",
  "assigned for pickup": "PICKUP_ASSIGNED",
  assigned_for_pickup: "PICKUP_ASSIGNED",

  "order.picked": "PICKED_UP",
  order_picked: "PICKED_UP",
  "picked up": "PICKED_UP",
  picked_up: "PICKED_UP",
  picked: "PICKED_UP",

  "order.pickup-failed": "PICKUP_FAILED",
  order_pickup_failed: "PICKUP_FAILED",
  "pickup failed": "PICKUP_FAILED",
  pickup_failed: "PICKUP_FAILED",

  "order.pickup-cancelled": "PICKUP_CANCELLED",
  order_pickup_cancelled: "PICKUP_CANCELLED",
  "pickup cancelled": "PICKUP_CANCELLED",
  "pickup canceled": "PICKUP_CANCELLED",
  pickup_cancelled: "PICKUP_CANCELLED",
  pickup_canceled: "PICKUP_CANCELLED",
  cancelled: "PICKUP_CANCELLED",
  canceled: "PICKUP_CANCELLED",

  // 3. Transit & Hub Lifecycle
  "order.at-the-sorting-hub": "AT_SORTING_HUB",
  order_at_the_sorting_hub: "AT_SORTING_HUB",
  "at the sorting hub": "AT_SORTING_HUB",
  "at sorting hub": "AT_SORTING_HUB",
  at_the_sorting_hub: "AT_SORTING_HUB",
  at_sorting_hub: "AT_SORTING_HUB",

  "order.in-transit": "IN_TRANSIT",
  order_in_transit: "IN_TRANSIT",
  "in transit": "IN_TRANSIT",
  in_transit: "IN_TRANSIT",
  intransit: "IN_TRANSIT",

  "order.received-at-last-mile-hub": "LAST_MILE_HUB",
  order_received_at_last_mile_hub: "LAST_MILE_HUB",
  "received at last mile hub": "LAST_MILE_HUB",
  "received at last-mile hub": "LAST_MILE_HUB",
  received_at_last_mile_hub: "LAST_MILE_HUB",
  "last mile hub": "LAST_MILE_HUB",
  last_mile_hub: "LAST_MILE_HUB",

  "order.assigned-for-delivery": "OUT_FOR_DELIVERY",
  order_assigned_for_delivery: "OUT_FOR_DELIVERY",
  "assigned for delivery": "OUT_FOR_DELIVERY",
  assigned_for_delivery: "OUT_FOR_DELIVERY",
  "out for delivery": "OUT_FOR_DELIVERY",
  out_for_delivery: "OUT_FOR_DELIVERY",

  // 4. Delivery & Exception Lifecycle
  "order.delivered": "DELIVERED",
  order_delivered: "DELIVERED",
  delivered: "DELIVERED",

  "order.partial-delivery": "PARTIALLY_DELIVERED",
  order_partial_delivery: "PARTIALLY_DELIVERED",
  "partial delivery": "PARTIALLY_DELIVERED",
  "partial delivered": "PARTIALLY_DELIVERED",
  "partially delivered": "PARTIALLY_DELIVERED",
  partial_delivery: "PARTIALLY_DELIVERED",
  partially_delivered: "PARTIALLY_DELIVERED",

  "order.delivery-failed": "DELIVERY_FAILED",
  order_delivery_failed: "DELIVERY_FAILED",
  "delivery failed": "DELIVERY_FAILED",
  delivery_failed: "DELIVERY_FAILED",

  "order.on-hold": "ON_HOLD",
  order_on_hold: "ON_HOLD",
  "on hold": "ON_HOLD",
  on_hold: "ON_HOLD",
  hold: "ON_HOLD",

  // 5. Return & Exchange Lifecycle
  "order.return": "RETURN_INITIATED",
  order_return: "RETURN_INITIATED",
  return: "RETURN_INITIATED",
  return_initiated: "RETURN_INITIATED",
  "return initiated": "RETURN_INITIATED",

  "order.paid-return": "PAID_RETURN_EVENT",
  order_paid_return: "PAID_RETURN_EVENT",
  "paid return": "PAID_RETURN_EVENT",
  paid_return: "PAID_RETURN_EVENT",
  paid_return_event: "PAID_RETURN_EVENT",

  "order.exchange": "EXCHANGE",
  order_exchange: "EXCHANGE",
  exchange: "EXCHANGE",

  "order.return-id-created": "RETURN_ID_CREATED",
  order_return_id_created: "RETURN_ID_CREATED",
  "return id created": "RETURN_ID_CREATED",
  return_id_created: "RETURN_ID_CREATED",

  "order.return-in-transit": "RETURN_IN_TRANSIT",
  order_return_in_transit: "RETURN_IN_TRANSIT",
  "return in transit": "RETURN_IN_TRANSIT",
  return_in_transit: "RETURN_IN_TRANSIT",

  "order.returned-to-merchant": "RETURNED_TO_MERCHANT",
  order_returned_to_merchant: "RETURNED_TO_MERCHANT",
  "returned to merchant": "RETURNED_TO_MERCHANT",
  returned_to_merchant: "RETURNED_TO_MERCHANT",
  "return completed": "RETURNED_TO_MERCHANT",
  "return arrived": "RETURNED_TO_MERCHANT",
  returned: "RETURNED_TO_MERCHANT",

  // 6. Financial / Payment Invoice Lifecycle
  "order.payment-invoice": "PAYMENT_INVOICE_EVENT",
  order_payment_invoice: "PAYMENT_INVOICE_EVENT",
  "payment invoice": "PAYMENT_INVOICE_EVENT",
  payment_invoice: "PAYMENT_INVOICE_EVENT",
  payment_invoice_event: "PAYMENT_INVOICE_EVENT",
};

interface StatusMetadata {
  displayLabel: string;
  internalOrderStatus:
    | "dispatched"
    | "delivered"
    | "returned"
    | "hold"
    | "cancelled"
    | null;
  shopifyFulfillmentEvent: ShopifyFulfillmentEventType;
  stageRank: number;
  isTerminalDelivery: boolean;
  isReturnLifecycle: boolean;
  isFinancialOnlyEvent: boolean;
}

const STATUS_METADATA: Record<NormalizedPathaoStatus, StatusMetadata> = {
  WEBHOOK_INTEGRATION: {
    displayLabel: "Webhook Integration",
    internalOrderStatus: null,
    shopifyFulfillmentEvent: null,
    stageRank: 0,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  ORDER_CREATED: {
    displayLabel: "Order Created",
    internalOrderStatus: "dispatched",
    shopifyFulfillmentEvent: "CONFIRMED",
    stageRank: 10,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  ORDER_UPDATED: {
    displayLabel: "Order Updated",
    internalOrderStatus: null,
    shopifyFulfillmentEvent: null,
    stageRank: 12,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  PICKUP_REQUESTED: {
    displayLabel: "Pickup Requested",
    internalOrderStatus: "dispatched",
    shopifyFulfillmentEvent: "CONFIRMED",
    stageRank: 20,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  PICKUP_ASSIGNED: {
    displayLabel: "Assigned for Pickup",
    internalOrderStatus: "dispatched",
    shopifyFulfillmentEvent: "CONFIRMED",
    stageRank: 25,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  PICKED_UP: {
    displayLabel: "Picked Up",
    internalOrderStatus: "dispatched",
    shopifyFulfillmentEvent: "CARRIER_PICKED_UP",
    stageRank: 30,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  PICKUP_FAILED: {
    displayLabel: "Pickup Failed",
    internalOrderStatus: "hold",
    shopifyFulfillmentEvent: "FAILURE",
    stageRank: 28,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  PICKUP_CANCELLED: {
    displayLabel: "Pickup Cancelled",
    internalOrderStatus: "cancelled",
    shopifyFulfillmentEvent: "FAILURE",
    stageRank: 29,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  AT_SORTING_HUB: {
    displayLabel: "At Sorting Hub",
    internalOrderStatus: "dispatched",
    shopifyFulfillmentEvent: "IN_TRANSIT",
    stageRank: 40,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  IN_TRANSIT: {
    displayLabel: "In Transit",
    internalOrderStatus: "dispatched",
    shopifyFulfillmentEvent: "IN_TRANSIT",
    stageRank: 50,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  LAST_MILE_HUB: {
    displayLabel: "At Last Mile Hub",
    internalOrderStatus: "dispatched",
    shopifyFulfillmentEvent: "IN_TRANSIT",
    stageRank: 60,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  OUT_FOR_DELIVERY: {
    displayLabel: "Out for Delivery",
    internalOrderStatus: "dispatched",
    shopifyFulfillmentEvent: "OUT_FOR_DELIVERY",
    stageRank: 70,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  DELIVERY_FAILED: {
    displayLabel: "Delivery Failed",
    internalOrderStatus: "hold",
    shopifyFulfillmentEvent: "ATTEMPTED_DELIVERY",
    stageRank: 75,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  ON_HOLD: {
    displayLabel: "On Hold",
    internalOrderStatus: "hold",
    shopifyFulfillmentEvent: "ATTEMPTED_DELIVERY",
    stageRank: 75,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  DELIVERED: {
    displayLabel: "Delivered",
    internalOrderStatus: "delivered",
    shopifyFulfillmentEvent: "DELIVERED",
    stageRank: 90,
    isTerminalDelivery: true,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
  PARTIALLY_DELIVERED: {
    displayLabel: "Partial Delivered",
    internalOrderStatus: "delivered",
    shopifyFulfillmentEvent: "DELIVERED",
    stageRank: 90,
    isTerminalDelivery: true,
    isReturnLifecycle: true,
    isFinancialOnlyEvent: false,
  },
  EXCHANGE: {
    displayLabel: "Exchange",
    internalOrderStatus: "delivered",
    shopifyFulfillmentEvent: "DELIVERED",
    stageRank: 92,
    isTerminalDelivery: true,
    isReturnLifecycle: true,
    isFinancialOnlyEvent: false,
  },
  RETURN_INITIATED: {
    displayLabel: "Return",
    internalOrderStatus: "returned",
    shopifyFulfillmentEvent: "FAILURE",
    stageRank: 95,
    isTerminalDelivery: false,
    isReturnLifecycle: true,
    isFinancialOnlyEvent: false,
  },
  PAID_RETURN_EVENT: {
    displayLabel: "Paid Return",
    internalOrderStatus: "returned",
    shopifyFulfillmentEvent: "FAILURE",
    stageRank: 96,
    isTerminalDelivery: false,
    isReturnLifecycle: true,
    isFinancialOnlyEvent: false,
  },
  RETURN_ID_CREATED: {
    displayLabel: "Return ID Created",
    internalOrderStatus: "returned",
    shopifyFulfillmentEvent: null,
    stageRank: 97,
    isTerminalDelivery: false,
    isReturnLifecycle: true,
    isFinancialOnlyEvent: false,
  },
  RETURN_IN_TRANSIT: {
    displayLabel: "Return In Transit",
    internalOrderStatus: "returned",
    shopifyFulfillmentEvent: null,
    stageRank: 98,
    isTerminalDelivery: false,
    isReturnLifecycle: true,
    isFinancialOnlyEvent: false,
  },
  RETURNED_TO_MERCHANT: {
    displayLabel: "Returned to Merchant",
    internalOrderStatus: "returned",
    shopifyFulfillmentEvent: null,
    stageRank: 100,
    isTerminalDelivery: false,
    isReturnLifecycle: true,
    isFinancialOnlyEvent: false,
  },
  PAYMENT_INVOICE_EVENT: {
    displayLabel: "Payment Invoice",
    internalOrderStatus: null,
    shopifyFulfillmentEvent: null,
    stageRank: 110,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: true,
  },
  UNKNOWN_EVENT: {
    displayLabel: "Unknown Event",
    internalOrderStatus: null,
    shopifyFulfillmentEvent: null,
    stageRank: 0,
    isTerminalDelivery: false,
    isReturnLifecycle: false,
    isFinancialOnlyEvent: false,
  },
};

/**
 * Normalizes any raw Pathao webhook event or status string into a canonical NormalizedPathaoStatus.
 */
export function normalizePathaoEvent(rawInput: string | null | undefined): PathaoEventNormalizationResult {
  const rawEvent = String(rawInput || "").trim();
  const lower = rawEvent.toLowerCase().trim();

  // Already normalized?
  if (rawEvent in STATUS_METADATA) {
    const norm = rawEvent as NormalizedPathaoStatus;
    return {
      rawEvent,
      normalizedStatus: norm,
      ...STATUS_METADATA[norm],
    };
  }

  let matched: NormalizedPathaoStatus | undefined = EXACT_EVENT_MAP[lower];

  if (!matched) {
    // Substring fallback matching in priority order
    if (lower.includes("webhook_integration") || lower.includes("webhook-integration")) {
      matched = "WEBHOOK_INTEGRATION";
    } else if (lower.includes("payment-invoice") || lower.includes("payment_invoice") || lower.includes("payment invoice")) {
      matched = "PAYMENT_INVOICE_EVENT";
    } else if (lower.includes("returned-to-merchant") || lower.includes("returned_to_merchant") || lower.includes("returned to merchant") || lower.includes("return completed")) {
      matched = "RETURNED_TO_MERCHANT";
    } else if (lower.includes("return-in-transit") || lower.includes("return_in_transit") || lower.includes("return in transit")) {
      matched = "RETURN_IN_TRANSIT";
    } else if (lower.includes("return-id-created") || lower.includes("return_id_created") || lower.includes("return id created")) {
      matched = "RETURN_ID_CREATED";
    } else if (lower.includes("paid-return") || lower.includes("paid_return") || lower.includes("paid return")) {
      matched = "PAID_RETURN_EVENT";
    } else if (lower.includes("partial-delivery") || lower.includes("partial_delivery") || lower.includes("partial deliver")) {
      matched = "PARTIALLY_DELIVERED";
    } else if (lower.includes("exchange")) {
      matched = "EXCHANGE";
    } else if (lower.includes("delivery-failed") || lower.includes("delivery_failed") || lower.includes("delivery failed")) {
      matched = "DELIVERY_FAILED";
    } else if (lower.includes("on-hold") || lower.includes("on_hold") || lower.includes("on hold")) {
      matched = "ON_HOLD";
    } else if (lower.includes("return")) {
      matched = "RETURN_INITIATED";
    } else if (lower.includes("delivered")) {
      matched = "DELIVERED";
    } else if (lower.includes("assigned-for-delivery") || lower.includes("assigned_for_delivery") || lower.includes("assigned for delivery") || lower.includes("out for delivery")) {
      matched = "OUT_FOR_DELIVERY";
    } else if (lower.includes("last-mile-hub") || lower.includes("last_mile_hub") || lower.includes("last mile hub")) {
      matched = "LAST_MILE_HUB";
    } else if (lower.includes("in-transit") || lower.includes("in_transit") || lower.includes("in transit")) {
      matched = "IN_TRANSIT";
    } else if (lower.includes("sorting-hub") || lower.includes("sorting_hub") || lower.includes("sorting hub")) {
      matched = "AT_SORTING_HUB";
    } else if (lower.includes("pickup-cancelled") || lower.includes("pickup_cancelled") || lower.includes("pickup cancelled") || lower.includes("pickup canceled")) {
      matched = "PICKUP_CANCELLED";
    } else if (lower.includes("pickup-failed") || lower.includes("pickup_failed") || lower.includes("pickup failed")) {
      matched = "PICKUP_FAILED";
    } else if (lower.includes("assigned-for-pickup") || lower.includes("assigned_for_pickup") || lower.includes("assigned for pickup")) {
      matched = "PICKUP_ASSIGNED";
    } else if (lower.includes("pickup-requested") || lower.includes("pickup_requested") || lower.includes("pickup requested")) {
      matched = "PICKUP_REQUESTED";
    } else if (lower.includes("picked")) {
      matched = "PICKED_UP";
    } else if (lower.includes("order.updated") || lower.includes("order_updated")) {
      matched = "ORDER_UPDATED";
    } else if (lower.includes("order.created") || lower.includes("order_created")) {
      matched = "ORDER_CREATED";
    } else {
      matched = "UNKNOWN_EVENT";
    }
  }

  return {
    rawEvent,
    normalizedStatus: matched,
    ...STATUS_METADATA[matched],
  };
}

export interface TransitionEvaluationInput {
  currentNormalizedStatus: string | null | undefined;
  currentEventTimestamp?: string | Date | null;
  incomingNormalizedStatus: NormalizedPathaoStatus;
  incomingEventTimestamp?: string | Date | null;
}

export interface TransitionEvaluationResult {
  shouldUpdateParcelStatus: boolean;
  shouldRecordHistory: boolean;
  reason: string;
}

/**
 * Evaluates whether an incoming Pathao event should update the current parcel status,
 * protecting against out-of-order / delayed courier webhooks while allowing legitimate
 * post-delivery or re-attempt transitions.
 */
export function evaluateStatusTransition(
  input: TransitionEvaluationInput
): TransitionEvaluationResult {
  const { incomingNormalizedStatus } = input;

  // Always record immutable history for every valid event
  if (
    incomingNormalizedStatus === "UNKNOWN_EVENT" ||
    incomingNormalizedStatus === "WEBHOOK_INTEGRATION"
  ) {
    return {
      shouldUpdateParcelStatus: false,
      shouldRecordHistory: true,
      reason: `Event ${incomingNormalizedStatus} logged in history only (does not mutate parcel delivery status).`,
    };
  }

  // Financial invoice event is processed into settlement/invoice fields without overwriting parcel delivery status
  if (incomingNormalizedStatus === "PAYMENT_INVOICE_EVENT") {
    return {
      shouldUpdateParcelStatus: false,
      shouldRecordHistory: true,
      reason: "Payment invoice event updates settlement ledger without overwriting parcel delivery state.",
    };
  }

  // ORDER_UPDATED is informational unless parcel has no status yet
  if (
    incomingNormalizedStatus === "ORDER_UPDATED" &&
    input.currentNormalizedStatus
  ) {
    return {
      shouldUpdateParcelStatus: false,
      shouldRecordHistory: true,
      reason: "Order updated metadata logged without regressing current parcel status.",
    };
  }

  if (!input.currentNormalizedStatus) {
    return {
      shouldUpdateParcelStatus: true,
      shouldRecordHistory: true,
      reason: "Initial parcel status set.",
    };
  }

  const currentNorm = normalizePathaoEvent(input.currentNormalizedStatus).normalizedStatus;
  const currentMeta = STATUS_METADATA[currentNorm];
  const incomingMeta = STATUS_METADATA[incomingNormalizedStatus];

  const currentTs = input.currentEventTimestamp
    ? new Date(input.currentEventTimestamp).getTime()
    : null;
  const incomingTs = input.incomingEventTimestamp
    ? new Date(input.incomingEventTimestamp).getTime()
    : null;

  const isIncomingOlderTimestamp =
    currentTs !== null &&
    incomingTs !== null &&
    !Number.isNaN(currentTs) &&
    !Number.isNaN(incomingTs) &&
    incomingTs < currentTs;

  // Rule 1: Once RETURNED_TO_MERCHANT is reached, no pre-return or lower-rank event can overwrite it
  if (currentNorm === "RETURNED_TO_MERCHANT") {
    if (incomingNormalizedStatus === "PAID_RETURN_EVENT") {
      return {
        shouldUpdateParcelStatus: false,
        shouldRecordHistory: true,
        reason: "Paid return metadata recorded; parcel is already Returned to Merchant.",
      };
    }
    return {
      shouldUpdateParcelStatus: false,
      shouldRecordHistory: true,
      reason: `Parcel is already in terminal state RETURNED_TO_MERCHANT; ignoring ${incomingNormalizedStatus}.`,
    };
  }

  // Rule 2: Once DELIVERED or PARTIALLY_DELIVERED is reached, pre-delivery transit/pickup events can NEVER overwrite it
  if (currentNorm === "DELIVERED" || currentNorm === "PARTIALLY_DELIVERED") {
    // Legitimate post-delivery events: return lifecycle or exchange
    if (incomingMeta.isReturnLifecycle) {
      // If current is already PARTIALLY_DELIVERED and incoming is RETURN_ID_CREATED / RETURN_IN_TRANSIT / RETURNED_TO_MERCHANT / PAID_RETURN_EVENT:
      // For partial delivery, the remaining returned items travel back via return events.
      // Only transition main status to RETURN_* if it's a full return or if it's explicitly RETURN_INITIATED after a full delivery.
      if (
        currentNorm === "PARTIALLY_DELIVERED" &&
        (incomingNormalizedStatus === "RETURN_ID_CREATED" ||
          incomingNormalizedStatus === "RETURN_IN_TRANSIT" ||
          incomingNormalizedStatus === "RETURNED_TO_MERCHANT" ||
          incomingNormalizedStatus === "PAID_RETURN_EVENT")
      ) {
        return {
          shouldUpdateParcelStatus: false,
          shouldRecordHistory: true,
          reason:
            "Partial delivery return leg event recorded in history while keeping parcel status as Partial Delivered.",
        };
      }
      return {
        shouldUpdateParcelStatus: true,
        shouldRecordHistory: true,
        reason: `Post-delivery transition from ${currentNorm} to ${incomingNormalizedStatus} allowed.`,
      };
    }

    return {
      shouldUpdateParcelStatus: false,
      shouldRecordHistory: true,
      reason: `Out-of-order pre-delivery event ${incomingNormalizedStatus} ignored because parcel is already ${currentNorm}.`,
    };
  }

  // Rule 3: Once in Return Lifecycle (RETURN_INITIATED, RETURN_ID_CREATED, RETURN_IN_TRANSIT),
  // older transit/pickup events cannot overwrite it
  if (currentMeta.isReturnLifecycle) {
    if (incomingMeta.stageRank >= currentMeta.stageRank) {
      return {
        shouldUpdateParcelStatus: true,
        shouldRecordHistory: true,
        reason: `Return lifecycle progression from ${currentNorm} to ${incomingNormalizedStatus}.`,
      };
    }
    return {
      shouldUpdateParcelStatus: false,
      shouldRecordHistory: true,
      reason: `Ignored lower-stage event ${incomingNormalizedStatus} while parcel is in return state ${currentNorm}.`,
    };
  }

  // Rule 4: Re-attempt after DELIVERY_FAILED or ON_HOLD
  // A parcel on hold or failed delivery can go back to OUT_FOR_DELIVERY (rank 70) if incoming timestamp is >= current timestamp
  if (
    (currentNorm === "DELIVERY_FAILED" || currentNorm === "ON_HOLD") &&
    incomingNormalizedStatus === "OUT_FOR_DELIVERY" &&
    !isIncomingOlderTimestamp
  ) {
    return {
      shouldUpdateParcelStatus: true,
      shouldRecordHistory: true,
      reason: `Re-delivery attempt (${incomingNormalizedStatus}) after ${currentNorm}.`,
    };
  }

  // Rule 5: Re-pickup after PICKUP_FAILED
  if (
    currentNorm === "PICKUP_FAILED" &&
    (incomingNormalizedStatus === "PICKUP_REQUESTED" ||
      incomingNormalizedStatus === "PICKUP_ASSIGNED" ||
      incomingNormalizedStatus === "PICKED_UP") &&
    !isIncomingOlderTimestamp
  ) {
    return {
      shouldUpdateParcelStatus: true,
      shouldRecordHistory: true,
      reason: `Pickup progression (${incomingNormalizedStatus}) after PICKUP_FAILED.`,
    };
  }

  // Rule 6: Standard rank + timestamp progression
  if (incomingMeta.stageRank < currentMeta.stageRank) {
    return {
      shouldUpdateParcelStatus: false,
      shouldRecordHistory: true,
      reason: `Out-of-order event ${incomingNormalizedStatus} (rank ${incomingMeta.stageRank}) is behind current status ${currentNorm} (rank ${currentMeta.stageRank}).`,
    };
  }

  if (
    incomingMeta.stageRank === currentMeta.stageRank &&
    isIncomingOlderTimestamp
  ) {
    return {
      shouldUpdateParcelStatus: false,
      shouldRecordHistory: true,
      reason: `Incoming event ${incomingNormalizedStatus} has an older timestamp than current status ${currentNorm}.`,
    };
  }

  return {
    shouldUpdateParcelStatus: true,
    shouldRecordHistory: true,
    reason: `Valid transition from ${currentNorm} to ${incomingNormalizedStatus}.`,
  };
}

/**
 * Computes a deterministic idempotency key for a Pathao webhook payload so duplicate
 * webhook deliveries are safely deduplicated while distinct events are preserved.
 */
export function computePathaoEventIdempotencyKey(payload: {
  consignment_id?: string | null;
  merchant_order_id?: string | null;
  event?: string | null;
  updated_at?: string | null;
  timestamp?: string | null;
  reason?: string | null;
  invoice_id?: string | null;
}): string {
  const consignment = String(
    payload.consignment_id || payload.merchant_order_id || "unknown"
  )
    .trim()
    .toUpperCase();
  const norm = normalizePathaoEvent(payload.event).normalizedStatus;
  const ts = String(payload.updated_at || payload.timestamp || "no-ts").trim();
  const extra = String(payload.invoice_id || payload.reason || "").trim();
  return `pathao:${consignment}:${norm}:${ts}${extra ? `:${extra}` : ""}`;
}

export interface TimelineStep {
  id: string;
  label: string;
  state: "completed" | "current" | "upcoming" | "warning" | "returned";
  timestamp?: string | null;
  subtitle?: string | null;
}

/**
 * Builds the 5-stage visual milestone timeline for Order Details:
 * Order Created → Pickup → In Transit → Out for Delivery → Delivered / Partial Delivery / Return
 */
export function buildParcelTimelineSteps(params: {
  normalizedStatus?: string | null;
  rawStatus?: string | null;
  dispatchedAt?: string | null;
  deliveredAt?: string | null;
  returnInitiatedAt?: string | null;
  returnedToMerchantAt?: string | null;
  lastEventTimestamp?: string | null;
}): TimelineStep[] {
  const norm = normalizePathaoEvent(
    params.normalizedStatus || params.rawStatus || "ORDER_CREATED"
  ).normalizedStatus;
  const meta = STATUS_METADATA[norm];
  const rank = meta.stageRank;

  const isReturn = meta.isReturnLifecycle && norm !== "PARTIALLY_DELIVERED";
  const isPartial = norm === "PARTIALLY_DELIVERED";
  const isDelivered = norm === "DELIVERED" || norm === "EXCHANGE";
  const isHoldOrFailed =
    norm === "ON_HOLD" || norm === "DELIVERY_FAILED" || norm === "PICKUP_FAILED";
  const isCancelled = norm === "PICKUP_CANCELLED";

  // Step 1: Order Created
  const step1: TimelineStep = {
    id: "order_created",
    label: "Order Created",
    state: rank >= 10 ? "completed" : "current",
    timestamp: params.dispatchedAt || null,
    subtitle: "Consignment booked",
  };

  // Step 2: Pickup
  let step2State: TimelineStep["state"] = "upcoming";
  let step2Subtitle = "Awaiting pickup";
  if (norm === "PICKUP_CANCELLED") {
    step2State = "returned";
    step2Subtitle = "Pickup Cancelled";
  } else if (norm === "PICKUP_FAILED") {
    step2State = "warning";
    step2Subtitle = "Pickup Failed";
  } else if (norm === "PICKUP_REQUESTED" || norm === "PICKUP_ASSIGNED") {
    step2State = "current";
    step2Subtitle = meta.displayLabel;
  } else if (rank >= 30) {
    step2State = "completed";
    step2Subtitle = "Picked Up";
  }

  const step2: TimelineStep = {
    id: "pickup",
    label: "Pickup",
    state: step2State,
    subtitle: step2Subtitle,
  };

  // Step 3: In Transit
  let step3State: TimelineStep["state"] = "upcoming";
  let step3Subtitle = "Sorting & Hub Transit";
  if (!isCancelled) {
    if (norm === "AT_SORTING_HUB" || norm === "IN_TRANSIT" || norm === "LAST_MILE_HUB") {
      step3State = "current";
      step3Subtitle = meta.displayLabel;
    } else if (rank >= 70) {
      step3State = "completed";
      step3Subtitle = "Arrived at Destination Hub";
    }
  }

  const step3: TimelineStep = {
    id: "in_transit",
    label: "In Transit",
    state: step3State,
    subtitle: step3Subtitle,
  };

  // Step 4: Out for Delivery
  let step4State: TimelineStep["state"] = "upcoming";
  let step4Subtitle = "Last-mile delivery";
  if (!isCancelled) {
    if (norm === "OUT_FOR_DELIVERY") {
      step4State = "current";
      step4Subtitle = "Assigned for Delivery";
    } else if (norm === "ON_HOLD" || norm === "DELIVERY_FAILED") {
      step4State = "warning";
      step4Subtitle = meta.displayLabel;
    } else if (rank >= 90) {
      step4State = "completed";
      step4Subtitle = "Attempted / Completed";
    }
  }

  const step4: TimelineStep = {
    id: "out_for_delivery",
    label: "Out for Delivery",
    state: step4State,
    subtitle: step4Subtitle,
  };

  // Step 5: Final Outcome (Delivered / Partial Delivery / Return)
  let step5Label = "Delivered";
  let step5State: TimelineStep["state"] = "upcoming";
  let step5Subtitle = "Final delivery status";
  let step5Timestamp = params.deliveredAt || null;

  if (isPartial) {
    step5Label = "Partial Delivery";
    step5State = "warning";
    step5Subtitle = "Partially Delivered";
    step5Timestamp = params.deliveredAt || params.lastEventTimestamp || null;
  } else if (isReturn) {
    step5Label = meta.displayLabel;
    step5State = norm === "RETURNED_TO_MERCHANT" ? "returned" : "warning";
    step5Subtitle =
      norm === "RETURNED_TO_MERCHANT"
        ? "Returned to Merchant"
        : `${meta.displayLabel} in progress`;
    step5Timestamp =
      params.returnedToMerchantAt ||
      params.returnInitiatedAt ||
      params.lastEventTimestamp ||
      null;
  } else if (isDelivered) {
    step5Label = norm === "EXCHANGE" ? "Exchange Delivered" : "Delivered";
    step5State = "completed";
    step5Subtitle = "Successfully Delivered";
    step5Timestamp = params.deliveredAt || params.lastEventTimestamp || null;
  } else if (isHoldOrFailed) {
    step5Label = "Delivery Pending";
    step5State = "upcoming";
    step5Subtitle = `Currently ${meta.displayLabel}`;
  }

  const step5: TimelineStep = {
    id: "final_outcome",
    label: step5Label,
    state: step5State,
    timestamp: step5Timestamp,
    subtitle: step5Subtitle,
  };

  return [step1, step2, step3, step4, step5];
}

