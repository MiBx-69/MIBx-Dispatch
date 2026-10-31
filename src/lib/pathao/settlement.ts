/**
 * Pure COD / settlement calculation for Pathao payment-invoice events.
 *
 * Keeps four things strictly separate:
 *  - expected COD          (what the customer should pay; from our own records)
 *  - collected COD         (only what Pathao explicitly reports; otherwise unknown/null)
 *  - courier deductions    (delivery + return + other fees)
 *  - actual merchant settlement (only what an invoice/settlement payload explicitly states;
 *                                otherwise null = unknown, NEVER the estimate)
 */

export interface InvoiceFinancials {
  expectedCod: number;
  collectedCod: number | null;
  deliveryCharge: number;
  returnCharge: number;
  otherDeductions: number;
  /** Estimate only. Must never be counted as cash received. */
  expectedSettlement: number | null;
  /** null = unknown / not yet confirmed by Pathao. */
  actualReceivedSettlement: number | null;
  settlementStatus: "settled" | "partially_settled" | "pending";
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function computeInvoiceFinancials(
  payload: Record<string, any>,
  dispatch?: Record<string, any> | null,
  order?: Record<string, any> | null
): InvoiceFinancials {
  const expectedCod =
    num(dispatch?.expected_cod) ??
    num(dispatch?.amount_to_collect) ??
    num(order?.total_price) ??
    0;

  // Collected COD is never assumed equal to expected COD.
  const collectedCod =
    num(payload.collected_amount) ??
    num(payload.cod_collected) ??
    num(dispatch?.actual_cod_collected);

  const deliveryCharge =
    num(payload.delivery_fee) ??
    num(dispatch?.delivery_fee) ??
    num(order?.delivery_charge) ??
    0;
  const returnCharge =
    num(payload.return_fee) ??
    num(payload.return_charge) ??
    num(dispatch?.return_charge) ??
    0;
  const otherDeductions =
    num(payload.other_deductions) ?? num(dispatch?.other_deductions) ?? 0;

  const expectedSettlement =
    collectedCod === null
      ? null
      : Math.max(0, collectedCod - deliveryCharge - returnCharge - otherDeductions);

  // Only an explicit amount from Pathao counts as money received.
  const actualReceivedSettlement =
    num(payload.settlement_amount) ?? num(payload.received_amount);

  let settlementStatus: InvoiceFinancials["settlementStatus"] = "pending";
  if (actualReceivedSettlement !== null && actualReceivedSettlement > 0) {
    settlementStatus =
      expectedSettlement !== null && actualReceivedSettlement >= expectedSettlement
        ? "settled"
        : "partially_settled";
  }

  return {
    expectedCod,
    collectedCod,
    deliveryCharge,
    returnCharge,
    otherDeductions,
    expectedSettlement,
    actualReceivedSettlement,
    settlementStatus,
  };
}

/**
 * Deterministic invoice idempotency key from the provider invoice id + consignment.
 * Falls back to consignment + event timestamp so two distinct payments don't collide,
 * while a replayed webhook with the same data maps to the same row.
 */
export function invoiceIdempotencyKey(
  payload: Record<string, any>,
  consignmentId: string,
  eventTimestamp: string
): string {
  const providerId =
    payload.invoice_id ||
    payload.payment_invoice_id ||
    payload.invoice_reference ||
    payload.payment_reference;
  return providerId
    ? `pathao:invoice:${consignmentId}:${String(providerId)}`
    : `pathao:invoice:${consignmentId}:${eventTimestamp}`;
}

