import { createServiceClient } from "@/lib/supabase/server";
import { formatPathaoTrackingUrl } from "@/lib/pathao/client";
import {
  normalizePathaoEvent,
  evaluateStatusTransition,
  computePathaoEventIdempotencyKey,
  type NormalizedPathaoStatus,
} from "@/lib/pathao/status-engine";
import { syncPathaoStatusToShopifyFulfillment } from "@/lib/shopify/client";
import { triggerAutoSms } from "@/lib/sms";

export interface PathaoWebhookPayload {
  consignment_id?: string;
  merchant_order_id?: string;
  order_status?: string;
  order_status_slug?: string;
  event?: string;
  updated_at?: string;
  timestamp?: string;
  store_id?: number;
  delivery_fee?: number;
  return_fee?: number;
  return_charge?: number;
  collected_amount?: number;
  cod_collected?: number;
  other_deductions?: number;
  settlement_amount?: number;
  invoice_id?: string;
  payment_invoice_id?: string;
  invoice_reference?: string;
  reason?: string;
  delivered_items?: Array<{
    sku?: string;
    title?: string;
    quantity: number;
    price?: number;
  }>;
  returned_items?: Array<{
    sku?: string;
    title?: string;
    quantity: number;
    price?: number;
  }>;
  [key: string]: any;
}

export interface ProcessPathaoWebhookResult {
  success: boolean;
  duplicate: boolean;
  ignoredOutOfOrder: boolean;
  normalizedStatus: NormalizedPathaoStatus;
  displayLabel: string;
  consignmentId: string | null;
  orderId: string | null;
  dispatchId: string | null;
  shopifySynced: boolean;
  shopifySyncError: string | null;
  reconciliationRequired: boolean;
  error?: string | null;
}

/**
 * Processes a Pathao webhook or reconciliation event idempotently, updating:
 * - public.pathao_status_history (immutable event log)
 * - public.dispatches (parcel state, timestamps, partial/paid return/invoice metadata)
 * - public.orders (internal status, pathao_delivery_status, tracking URL)
 * - public.returns (Full Return / Partial Return records without auto-refunding Shopify)
 * - public.pathao_payment_invoices (for order.payment-invoice events)
 * - Shopify fulfillment tracking & events (isolated so Shopify API errors never roll back Pathao state)
 */
export async function processPathaoWebhookEvent(params: {
  payload: PathaoWebhookPayload;
  webhookLogId?: string | null;
  forceRetry?: boolean;
  skipSms?: boolean;
}): Promise<ProcessPathaoWebhookResult> {
  const supabase = createServiceClient();
  const { payload, webhookLogId, forceRetry = false, skipSms = false } = params;

  const rawEventStr =
    payload.event ||
    payload.order_status_slug ||
    payload.order_status ||
    "unknown";
  const norm = normalizePathaoEvent(rawEventStr);
  const consignmentId = payload.consignment_id
    ? String(payload.consignment_id).trim()
    : null;
  const merchantOrderId = payload.merchant_order_id
    ? String(payload.merchant_order_id).trim()
    : null;
  const eventTimestamp =
    payload.updated_at || payload.timestamp || new Date().toISOString();
  const idempotencyKey = computePathaoEventIdempotencyKey({
    consignment_id: consignmentId,
    merchant_order_id: merchantOrderId,
    event: rawEventStr,
    updated_at: payload.updated_at,
    timestamp: payload.timestamp,
    reason: payload.reason,
    invoice_id:
      payload.invoice_id ||
      payload.payment_invoice_id ||
      payload.invoice_reference,
  });

  // 1. Handshake event
  if (norm.normalizedStatus === "WEBHOOK_INTEGRATION") {
    if (webhookLogId) {
      await supabase
        .from("webhook_logs")
        .update({
          processed: true,
          processing_status: "processed",
          shopify_sync_status: "not_required",
          normalized_event: norm.normalizedStatus,
        })
        .eq("id", webhookLogId);
    }
    return {
      success: true,
      duplicate: false,
      ignoredOutOfOrder: false,
      normalizedStatus: norm.normalizedStatus,
      displayLabel: norm.displayLabel,
      consignmentId,
      orderId: null,
      dispatchId: null,
      shopifySynced: true,
      shopifySyncError: null,
      reconciliationRequired: false,
    };
  }

  // 2. Duplicate / Replay Check in pathao_status_history
  if (!forceRetry) {
    const { data: existingHistory } = await supabase
      .from("pathao_status_history")
      .select("id, order_id, dispatch_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingHistory) {
      if (webhookLogId) {
        await supabase
          .from("webhook_logs")
          .update({
            processed: true,
            processing_status: "processed",
            shopify_sync_status: "skipped_duplicate",
            normalized_event: norm.normalizedStatus,
          })
          .eq("id", webhookLogId);
      }
      return {
        success: true,
        duplicate: true,
        ignoredOutOfOrder: false,
        normalizedStatus: norm.normalizedStatus,
        displayLabel: norm.displayLabel,
        consignmentId,
        orderId: existingHistory.order_id,
        dispatchId: existingHistory.dispatch_id,
        shopifySynced: true,
        shopifySyncError: null,
        reconciliationRequired: false,
      };
    }
  }

  // 3. Locate Dispatch & Order by consignment_id or merchant_order_id
  let dispatch: any = null;
  let order: any = null;

  if (consignmentId) {
    const { data: foundDispatch } = await supabase
      .from("dispatches")
      .select("*, orders(*)")
      .eq("consignment_id", consignmentId)
      .order("dispatched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (foundDispatch) {
      dispatch = foundDispatch;
      order = foundDispatch.orders;
    }
  }

  if (!dispatch && merchantOrderId) {
    const cleanRef = merchantOrderId.replace(/^#/, "").trim();
    const { data: foundByMerchant } = await supabase
      .from("dispatches")
      .select("*, orders(*)")
      .or(
        `merchant_order_id.eq.${merchantOrderId},shopify_order_name.eq.#${cleanRef},shopify_order_name.eq.${cleanRef}`
      )
      .order("dispatched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (foundByMerchant) {
      dispatch = foundByMerchant;
      order = foundByMerchant.orders;
    }
  }

  if (!order && (consignmentId || merchantOrderId)) {
    const orFilters: string[] = [];
    if (consignmentId) {
      orFilters.push(`pathao_consignment_id.eq.${consignmentId}`);
    }
    if (merchantOrderId) {
      const cleanRef = merchantOrderId.replace(/^#/, "").trim();
      orFilters.push(`shopify_order_name.eq.#${cleanRef}`);
      orFilters.push(`shopify_order_name.eq.${cleanRef}`);
      if (/^\d+$/.test(cleanRef)) {
        orFilters.push(`shopify_order_number.eq.${cleanRef}`);
      }
    }

    if (orFilters.length > 0) {
      const { data: foundOrder } = await supabase
        .from("orders")
        .select("*")
        .or(orFilters.join(","))
        .limit(1)
        .maybeSingle();

      if (foundOrder) {
        order = foundOrder;
      }
    }
  }

  // If order was found via merchant_order_id (e.g., async bulk order creation webhook `order.created`)
  // and no dispatch record exists yet for this consignmentId, create the dispatch record now!
  if (!dispatch && order && consignmentId) {
    const expectedCod =
      String(order.financial_status || "").toLowerCase() === "paid"
        ? 0
        : Number(order.total_price || 0);
    const { data: createdDispatch } = await supabase
      .from("dispatches")
      .insert({
        order_id: order.id,
        shopify_order_id: order.shopify_order_id,
        shopify_order_name: order.shopify_order_name,
        consignment_id: consignmentId,
        merchant_order_id: merchantOrderId || order.shopify_order_name,
        recipient_name: order.customer_name,
        recipient_phone: order.customer_phone,
        recipient_address:
          (order.shipping_address as any)?.address1 || "Dhaka, Bangladesh",
        delivery_type: 48,
        item_type: 2,
        item_quantity: 1,
        item_weight: 0.5,
        amount_to_collect: expectedCod,
        expected_cod: expectedCod,
        delivery_fee:
          payload.delivery_fee !== undefined
            ? Number(payload.delivery_fee)
            : Number(order.delivery_charge || 0),
        pathao_order_status: norm.displayLabel,
        normalized_status: norm.normalizedStatus,
        last_pathao_event: rawEventStr,
        last_event_timestamp: eventTimestamp,
        settlement_status: "pending",
        tracking_history: [],
      })
      .select("*")
      .single();

    if (createdDispatch) {
      dispatch = createdDispatch;
    }
  }

  // 4. Record immutable event in pathao_status_history (even if order is unmatched or event is unknown)
  if (consignmentId || merchantOrderId) {
    await supabase.from("pathao_status_history").upsert(
      {
        dispatch_id: dispatch?.id || null,
        order_id: order?.id || null,
        consignment_id: consignmentId || merchantOrderId || "UNKNOWN",
        merchant_order_id:
          merchantOrderId ||
          dispatch?.merchant_order_id ||
          order?.shopify_order_name ||
          null,
        raw_event: rawEventStr,
        normalized_status: norm.normalizedStatus,
        reason: payload.reason || null,
        event_timestamp: eventTimestamp,
        raw_payload: payload as any,
        idempotency_key: idempotencyKey,
      },
      { onConflict: "idempotency_key" }
    );
  }

  // If no matching order/dispatch exists in DB, mark webhook log for visibility/retry
  if (!dispatch && !order) {
    const errMsg = `No matching order or dispatch found for consignment_id=${consignmentId || "N/A"}, merchant_order_id=${merchantOrderId || "N/A"}`;
    if (webhookLogId) {
      await supabase
        .from("webhook_logs")
        .update({
          processed: false,
          processing_status: "failed",
          shopify_sync_status: "pending",
          normalized_event: norm.normalizedStatus,
          error: errMsg,
        })
        .eq("id", webhookLogId);
    }
    return {
      success: false,
      duplicate: false,
      ignoredOutOfOrder: false,
      normalizedStatus: norm.normalizedStatus,
      displayLabel: norm.displayLabel,
      consignmentId,
      orderId: null,
      dispatchId: null,
      shopifySynced: false,
      shopifySyncError: null,
      reconciliationRequired: false,
      error: errMsg,
    };
  }

  // 5. Handle UNKNOWN_EVENT safely (logged in history without corrupting parcel status)
  if (norm.normalizedStatus === "UNKNOWN_EVENT") {
    if (webhookLogId) {
      await supabase
        .from("webhook_logs")
        .update({
          processed: true,
          processing_status: "processed",
          shopify_sync_status: "not_required",
          normalized_event: "UNKNOWN_EVENT",
        })
        .eq("id", webhookLogId);
    }
    return {
      success: true,
      duplicate: false,
      ignoredOutOfOrder: false,
      normalizedStatus: "UNKNOWN_EVENT",
      displayLabel: norm.displayLabel,
      consignmentId,
      orderId: order?.id || null,
      dispatchId: dispatch?.id || null,
      shopifySynced: true,
      shopifySyncError: null,
      reconciliationRequired: false,
    };
  }

  // 6. Handle PAYMENT_INVOICE_EVENT (Financial / COD Settlement Event)
  if (norm.normalizedStatus === "PAYMENT_INVOICE_EVENT") {
    const expectedCod = Number(
      dispatch?.expected_cod ?? dispatch?.amount_to_collect ?? order?.total_price ?? 0
    );
    const collectedCod = Number(
      payload.collected_amount ??
        payload.cod_collected ??
        dispatch?.actual_cod_collected ??
        expectedCod
    );
    const deliveryCharge = Number(
      payload.delivery_fee ?? dispatch?.delivery_fee ?? order?.delivery_charge ?? 0
    );
    const returnCharge = Number(
      payload.return_fee ?? payload.return_charge ?? dispatch?.return_charge ?? 0
    );
    const otherDeductions = Number(
      payload.other_deductions ?? dispatch?.other_deductions ?? 0
    );
    const expectedSettlement = Math.max(
      0,
      collectedCod - deliveryCharge - returnCharge - otherDeductions
    );
    const actualReceivedSettlement = Number(
      payload.settlement_amount ??
        payload.received_amount ??
        expectedSettlement
    );
    const invoiceRef =
      payload.invoice_id ||
      payload.payment_invoice_id ||
      payload.invoice_reference ||
      payload.payment_reference ||
      `INV-${consignmentId || dispatch?.consignment_id}`;

    const settlementStatus =
      actualReceivedSettlement >= expectedSettlement && expectedSettlement >= 0
        ? "settled"
        : actualReceivedSettlement > 0
          ? "partially_settled"
          : "pending";

    await supabase.from("pathao_payment_invoices").upsert(
      {
        consignment_id: consignmentId || dispatch?.consignment_id || "UNKNOWN",
        order_id: order?.id || dispatch?.order_id || null,
        dispatch_id: dispatch?.id || null,
        merchant_order_id:
          merchantOrderId ||
          dispatch?.merchant_order_id ||
          order?.shopify_order_name ||
          null,
        invoice_reference: String(invoiceRef),
        expected_cod: expectedCod,
        collected_cod: collectedCod,
        delivery_charge: deliveryCharge,
        return_charge: returnCharge,
        other_deductions: otherDeductions,
        expected_settlement: expectedSettlement,
        actual_received_settlement: actualReceivedSettlement,
        settlement_status: settlementStatus,
        payment_date: eventTimestamp,
        raw_payload: payload as any,
        idempotency_key: idempotencyKey,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "idempotency_key" }
    );

    if (dispatch) {
      await supabase
        .from("dispatches")
        .update({
          actual_cod_collected: collectedCod,
          delivery_fee: deliveryCharge,
          return_charge: returnCharge,
          other_deductions: otherDeductions,
          settlement_amount: expectedSettlement,
          actual_received_amount: actualReceivedSettlement,
          settlement_status: settlementStatus,
          settlement_date: eventTimestamp.slice(0, 10),
          payment_reference: String(invoiceRef),
          payment_invoice_details: {
            invoice_reference: invoiceRef,
            expected_cod: expectedCod,
            collected_cod: collectedCod,
            delivery_charge: deliveryCharge,
            return_charge: returnCharge,
            other_deductions: otherDeductions,
            expected_settlement: expectedSettlement,
            actual_received_settlement: actualReceivedSettlement,
            payment_date: eventTimestamp,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", dispatch.id);
    }

    if (webhookLogId) {
      await supabase
        .from("webhook_logs")
        .update({
          processed: true,
          processing_status: "processed",
          shopify_sync_status: "not_required",
          normalized_event: norm.normalizedStatus,
          shopify_order_id: order?.shopify_order_id || dispatch?.shopify_order_id || null,
        })
        .eq("id", webhookLogId);
    }

    return {
      success: true,
      duplicate: false,
      ignoredOutOfOrder: false,
      normalizedStatus: norm.normalizedStatus,
      displayLabel: norm.displayLabel,
      consignmentId: consignmentId || dispatch?.consignment_id || null,
      orderId: order?.id || dispatch?.order_id || null,
      dispatchId: dispatch?.id || null,
      shopifySynced: true,
      shopifySyncError: null,
      reconciliationRequired: false,
    };
  }

  // 7. Evaluate Out-of-Order / State Transition Rules
  const currentNormalizedStatus =
    dispatch?.normalized_status ||
    dispatch?.pathao_order_status ||
    order?.pathao_delivery_status ||
    null;
  const transition = evaluateStatusTransition({
    currentNormalizedStatus,
    currentEventTimestamp: dispatch?.last_event_timestamp || null,
    incomingNormalizedStatus: norm.normalizedStatus,
    incomingEventTimestamp: eventTimestamp,
  });

  // Append to dispatch tracking_history array for auditability
  const existingHistoryArr = Array.isArray(dispatch?.tracking_history)
    ? (dispatch.tracking_history as any[])
    : [];
  const updatedHistoryArr = [
    ...existingHistoryArr,
    {
      status: norm.displayLabel,
      normalized_status: norm.normalizedStatus,
      event: rawEventStr,
      timestamp: eventTimestamp,
      reason: payload.reason || null,
      applied: transition.shouldUpdateParcelStatus,
    },
  ];

  // Special case: Paid Return metadata or Partial Delivery return leg events
  if (norm.normalizedStatus === "PAID_RETURN_EVENT" && dispatch) {
    const returnFee = Number(
      payload.return_fee ??
        payload.return_charge ??
        payload.delivery_fee ??
        dispatch.return_charge ??
        0
    );
    await supabase
      .from("dispatches")
      .update({
        return_charge: returnFee,
        paid_return_details: {
          event: rawEventStr,
          timestamp: eventTimestamp,
          reason: payload.reason || null,
          return_fee: returnFee,
        },
        tracking_history: updatedHistoryArr,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dispatch.id);
  }

  if (!transition.shouldUpdateParcelStatus) {
    if (dispatch) {
      const extraUpdates: Record<string, any> = {
        tracking_history: updatedHistoryArr,
        updated_at: new Date().toISOString(),
      };
      if (norm.normalizedStatus === "RETURNED_TO_MERCHANT") {
        extraUpdates.returned_to_merchant_at =
          dispatch.returned_to_merchant_at || eventTimestamp;
      }
      await supabase
        .from("dispatches")
        .update(extraUpdates as any)
        .eq("id", dispatch.id);
    }

    if (webhookLogId) {
      await supabase
        .from("webhook_logs")
        .update({
          processed: true,
          processing_status: "processed",
          shopify_sync_status: "not_required",
          normalized_event: norm.normalizedStatus,
          shopify_order_id:
            order?.shopify_order_id || dispatch?.shopify_order_id || null,
        })
        .eq("id", webhookLogId);
    }

    return {
      success: true,
      duplicate: false,
      ignoredOutOfOrder: true,
      normalizedStatus: norm.normalizedStatus,
      displayLabel: norm.displayLabel,
      consignmentId: consignmentId || dispatch?.consignment_id || null,
      orderId: order?.id || dispatch?.order_id || null,
      dispatchId: dispatch?.id || null,
      shopifySynced: true,
      shopifySyncError: null,
      reconciliationRequired: Boolean(
        dispatch?.partial_delivery_reconciliation_required
      ),
    };
  }

  // 8. Apply Valid Parcel Status Update to `dispatches` & `orders`
  const nowIso = new Date().toISOString();
  const effectiveConsignmentId =
    consignmentId ||
    dispatch?.consignment_id ||
    order?.pathao_consignment_id ||
    "";
  const trackingPhone =
    dispatch?.recipient_phone ||
    order?.customer_phone ||
    (order?.shipping_address as any)?.phone ||
    "";
  const trackingUrl = formatPathaoTrackingUrl(
    effectiveConsignmentId,
    trackingPhone
  );

  let reconciliationRequired = Boolean(
    dispatch?.partial_delivery_reconciliation_required
  );
  const dispatchUpdates: Record<string, any> = {
    consignment_id: effectiveConsignmentId,
    pathao_order_status: norm.displayLabel,
    normalized_status: norm.normalizedStatus,
    last_pathao_event: rawEventStr,
    last_event_timestamp: eventTimestamp,
    tracking_history: updatedHistoryArr,
    updated_at: nowIso,
  };

  if (payload.delivery_fee !== undefined && payload.delivery_fee !== null) {
    dispatchUpdates.delivery_fee = Number(payload.delivery_fee);
  }

  if (norm.normalizedStatus === "DELIVERED") {
    dispatchUpdates.delivered_at = dispatch?.delivered_at || eventTimestamp;
    // Only record collected_amount if explicitly sent by Pathao; never mark settlement_status = 'settled' until payment invoice!
    if (
      payload.collected_amount !== undefined ||
      payload.cod_collected !== undefined
    ) {
      dispatchUpdates.actual_cod_collected = Number(
        payload.collected_amount ?? payload.cod_collected
      );
    }
    dispatchUpdates.settlement_status =
      dispatch?.settlement_status === "settled" ? "settled" : "pending";
  } else if (norm.normalizedStatus === "PARTIALLY_DELIVERED") {
    dispatchUpdates.delivered_at = dispatch?.delivered_at || eventTimestamp;
    const hasExplicitReturnedItems =
      Array.isArray(payload.returned_items) &&
      payload.returned_items.length > 0;
    const hasExplicitDeliveredItems =
      Array.isArray(payload.delivered_items) &&
      payload.delivered_items.length > 0;

    // Never invent delivered product quantities when Pathao omits item-level breakdown
    reconciliationRequired =
      !hasExplicitReturnedItems && !hasExplicitDeliveredItems;
    dispatchUpdates.partial_delivery_reconciliation_required =
      reconciliationRequired;
    dispatchUpdates.partial_delivery_details = {
      event: rawEventStr,
      timestamp: eventTimestamp,
      reason: payload.reason || null,
      collected_amount:
        payload.collected_amount ?? payload.cod_collected ?? null,
      delivered_items: payload.delivered_items || null,
      returned_items: payload.returned_items || null,
      reconciliation_required: reconciliationRequired,
    };
    if (
      payload.collected_amount !== undefined ||
      payload.cod_collected !== undefined
    ) {
      dispatchUpdates.actual_cod_collected = Number(
        payload.collected_amount ?? payload.cod_collected
      );
    }
  } else if (norm.isReturnLifecycle) {
    dispatchUpdates.return_initiated_at =
      dispatch?.return_initiated_at || eventTimestamp;
    if (norm.normalizedStatus === "RETURNED_TO_MERCHANT") {
      dispatchUpdates.returned_to_merchant_at =
        dispatch?.returned_to_merchant_at || eventTimestamp;
      dispatchUpdates.actual_cod_collected = 0;
    }
    if (
      payload.return_fee !== undefined ||
      payload.return_charge !== undefined
    ) {
      dispatchUpdates.return_charge = Number(
        payload.return_fee ?? payload.return_charge
      );
    }
  } else if (norm.normalizedStatus === "PICKUP_CANCELLED") {
    dispatchUpdates.is_cancelled = true;
    dispatchUpdates.cancelled_at = eventTimestamp;
    dispatchUpdates.cancel_reason =
      payload.reason || "Pickup cancelled by Pathao";
  }

  if (dispatch) {
    await supabase
      .from("dispatches")
      .update(dispatchUpdates as any)
      .eq("id", dispatch.id);
  }

  const targetOrderId = order?.id || dispatch?.order_id || null;
  if (targetOrderId) {
    const orderUpdates: Record<string, any> = {
      pathao_consignment_id: effectiveConsignmentId,
      pathao_delivery_status: norm.displayLabel,
      pathao_tracking_url: trackingUrl,
      updated_at: nowIso,
    };

    if (norm.internalOrderStatus) {
      orderUpdates.internal_status = norm.internalOrderStatus;
    }
    if (
      norm.normalizedStatus === "DELIVERED" ||
      norm.normalizedStatus === "PARTIALLY_DELIVERED"
    ) {
      orderUpdates.delivered_at = order?.delivered_at || eventTimestamp;
    }
    if (payload.delivery_fee !== undefined && payload.delivery_fee !== null) {
      orderUpdates.delivery_charge = Number(payload.delivery_fee);
    }

    await supabase.from("orders").update(orderUpdates as any).eq("id", targetOrderId);

    // Record Order Audit Event
    await supabase.from("order_events").insert({
      order_id: targetOrderId,
      event_type: `PATHAO_${norm.normalizedStatus}`,
      description: `Pathao Status: ${norm.displayLabel} (${effectiveConsignmentId})${payload.reason ? ` — ${payload.reason}` : ""}`,
      metadata: {
        consignment_id: effectiveConsignmentId,
        raw_event: rawEventStr,
        normalized_status: norm.normalizedStatus,
        reason: payload.reason || null,
        timestamp: eventTimestamp,
        reconciliation_required: reconciliationRequired,
      },
    });
  }

  // 9. Return Record Management (Full Return vs Partial Return)
  // Never automatically issue a customer refund on Shopify!
  if (targetOrderId && norm.isReturnLifecycle) {
    const lineItems = Array.isArray(order?.line_items)
      ? (order.line_items as any[])
      : [];
    const totalOrderQty =
      lineItems.reduce(
        (sum: number, item: any) =>
          sum + Number(item.original_quantity ?? item.quantity ?? 1),
        0
      ) || 1;
    const origTotalValue = Number(
      order?.original_total_price ?? order?.total_price ?? 0
    );

    if (norm.normalizedStatus === "PARTIALLY_DELIVERED") {
      // Only create a Partial Return record automatically if Pathao explicitly sent returned_items;
      // otherwise reconciliation_required = true prompts staff to select returned items via ReturnModal.
      if (
        Array.isArray(payload.returned_items) &&
        payload.returned_items.length > 0
      ) {
        const returnedQty = payload.returned_items.reduce(
          (s, i) => s + Number(i.quantity || 0),
          0
        );
        const returnedVal = payload.returned_items.reduce(
          (s, i) => s + Number(i.quantity || 0) * Number(i.price || 0),
          0
        );
        const { data: existingReturn } = await supabase
          .from("returns")
          .select("id")
          .eq("order_id", targetOrderId)
          .maybeSingle();

        const returnPayload: any = {
          order_id: targetOrderId,
          dispatch_id: dispatch?.id || null,
          consignment_id: effectiveConsignmentId,
          return_type: "partial",
          status: "return_in_progress",
          is_verified: true,
          verification_status: "verified",
          original_order_quantity: totalOrderQty,
          returned_quantity: returnedQty,
          order_total: origTotalValue,
          returned_product_value: returnedVal,
          returned_items: payload.returned_items as any,
          return_reason: payload.reason || "Pathao Partial Delivery",
          returned_at: nowIso,
          updated_at: nowIso,
        };

        if (existingReturn) {
          await supabase
            .from("returns")
            .update(returnPayload)
            .eq("id", existingReturn.id);
        } else {
          await supabase.from("returns").insert(returnPayload);
        }
      }
    } else {
      // Full Return Lifecycle (RETURN_INITIATED, RETURN_ID_CREATED, RETURN_IN_TRANSIT, RETURNED_TO_MERCHANT, PAID_RETURN_EVENT)
      const isCompletedReturn =
        norm.normalizedStatus === "RETURNED_TO_MERCHANT";
      const returnStatus = isCompletedReturn
        ? "returned"
        : "return_in_progress";
      const returnFee = Number(
        payload.return_fee ??
          payload.return_charge ??
          dispatch?.return_charge ??
          0
      );

      const { data: existingReturn } = await supabase
        .from("returns")
        .select("id, return_type")
        .eq("order_id", targetOrderId)
        .maybeSingle();

      // Do not overwrite an existing partial return into a full return
      if (!existingReturn) {
        const fullReturnItems = lineItems.map((item: any) => {
          const qty = Number(item.original_quantity ?? item.quantity ?? 1);
          const price = Number(item.price || 0);
          return {
            title: item.title || item.name || "Product",
            sku: item.sku || null,
            variant_title: item.variant_title || null,
            ordered_quantity: qty,
            returned_quantity: qty,
            kept_quantity: 0,
            unit_price: price,
            returned_line_amount: qty * price,
          };
        });

        await supabase.from("returns").insert({
          order_id: targetOrderId,
          dispatch_id: dispatch?.id || null,
          consignment_id: effectiveConsignmentId,
          return_type: "full",
          status: returnStatus,
          is_verified: isCompletedReturn,
          verification_status: isCompletedReturn ? "verified" : "pending",
          original_order_quantity: totalOrderQty,
          returned_quantity: totalOrderQty,
          order_total: origTotalValue,
          returned_product_value: origTotalValue,
          return_delivery_fee: returnFee,
          is_paid_return:
            norm.normalizedStatus === "PAID_RETURN_EVENT" || returnFee > 0,
          returned_items: fullReturnItems as any,
          return_reason: payload.reason || `Pathao ${norm.displayLabel}`,
          returned_at: isCompletedReturn ? eventTimestamp : nowIso,
          updated_at: nowIso,
        } as any);
      } else if (existingReturn.return_type === "full") {
        await supabase
          .from("returns")
          .update({
            status: returnStatus,
            is_verified: isCompletedReturn,
            verification_status: isCompletedReturn ? "verified" : "pending",
            ...(returnFee > 0
              ? { return_delivery_fee: returnFee, is_paid_return: true }
              : {}),
            updated_at: nowIso,
          } as any)
          .eq("id", existingReturn.id);
      }
    }
  }

  // 10. Synchronize Fulfillment Event & Tracking with Shopify (Fault-Isolated)
  let shopifySynced = true;
  let shopifySyncError: string | null = null;
  const shopifyOrderId =
    order?.shopify_order_id || dispatch?.shopify_order_id || null;
  const currentFulfillmentId =
    dispatch?.shopify_fulfillment_id || order?.shopify_fulfillment_id || null;

  if (
    shopifyOrderId &&
    (norm.shopifyFulfillmentEvent ||
      norm.normalizedStatus === "DELIVERED" ||
      norm.normalizedStatus === "PARTIALLY_DELIVERED")
  ) {
    try {
      const syncResult = await syncPathaoStatusToShopifyFulfillment({
        shopifyOrderId,
        shopifyFulfillmentId: currentFulfillmentId,
        consignmentId: effectiveConsignmentId,
        trackingUrl,
        normalizedStatus: norm.normalizedStatus,
        displayLabel: norm.displayLabel,
        shopifyFulfillmentEvent: norm.shopifyFulfillmentEvent,
        reason: payload.reason || null,
        eventTimestamp,
      });

      shopifySynced = syncResult.success;
      shopifySyncError =
        syncResult.errors.length > 0 ? syncResult.errors.join("; ") : null;

      if (dispatch) {
        await supabase
          .from("dispatches")
          .update({
            shopify_fulfillment_id:
              syncResult.fulfillmentId || currentFulfillmentId,
            shopify_sync_status: syncResult.success ? "synced" : "failed",
            shopify_sync_error: shopifySyncError,
            last_synced_at: nowIso,
          })
          .eq("id", dispatch.id);
      }

      if (
        targetOrderId &&
        syncResult.fulfillmentId &&
        syncResult.fulfillmentId !== order?.shopify_fulfillment_id
      ) {
        await supabase
          .from("orders")
          .update({
            shopify_fulfillment_id: syncResult.fulfillmentId,
            fulfillment_status: "fulfilled",
          })
          .eq("id", targetOrderId);
      }
    } catch (err: any) {
      shopifySynced = false;
      shopifySyncError = err.message || "Shopify fulfillment sync failed";
      if (dispatch) {
        await supabase
          .from("dispatches")
          .update({
            shopify_sync_status: "failed",
            shopify_sync_error: shopifySyncError,
          })
          .eq("id", dispatch.id);
      }
    }
  }

  // 11. Trigger Auto-SMS notifications (only on first non-duplicate processing)
  if (!skipSms && order) {
    try {
      const smsPhone =
        order.customer_phone ||
        dispatch?.recipient_phone ||
        (order.shipping_address as any)?.phone;
      const smsVars = {
        customer_name:
          order.customer_name || dispatch?.recipient_name || "Customer",
        order_number:
          order.shopify_order_name || `#${order.shopify_order_number}`,
        consignment_id: effectiveConsignmentId,
        amount: String(order.total_price || dispatch?.amount_to_collect || 0),
        tracking_url: trackingUrl,
      };

      if (norm.normalizedStatus === "OUT_FOR_DELIVERY") {
        await triggerAutoSms("out_for_delivery", smsPhone, smsVars, {
          shopifyOrderId: order.shopify_order_id,
          idempotencyKey: `sms:out_for_delivery:${effectiveConsignmentId}`,
        });
      } else if (norm.normalizedStatus === "DELIVERED") {
        await triggerAutoSms("delivered", smsPhone, smsVars, {
          shopifyOrderId: order.shopify_order_id,
          idempotencyKey: `sms:delivered:${effectiveConsignmentId}`,
        });
      } else if (norm.normalizedStatus === "RETURN_INITIATED") {
        await triggerAutoSms("returned", smsPhone, smsVars, {
          shopifyOrderId: order.shopify_order_id,
          idempotencyKey: `sms:returned:${effectiveConsignmentId}`,
        });
      } else if (
        norm.normalizedStatus === "ON_HOLD" ||
        norm.normalizedStatus === "DELIVERY_FAILED"
      ) {
        await triggerAutoSms("on_hold", smsPhone, smsVars, {
          shopifyOrderId: order.shopify_order_id,
          idempotencyKey: `sms:on_hold:${effectiveConsignmentId}:${eventTimestamp}`,
        });
      }
    } catch (smsErr) {
      console.error("[Pathao Webhook] Auto-SMS non-fatal error:", smsErr);
    }
  }

  // 12. Update webhook_logs status
  if (webhookLogId) {
    await supabase
      .from("webhook_logs")
      .update({
        processed: true,
        processing_status: shopifySynced ? "processed" : "failed",
        shopify_sync_status: shopifySynced ? "synced" : "failed",
        normalized_event: norm.normalizedStatus,
        shopify_order_id: shopifyOrderId,
        error: shopifySyncError,
      })
      .eq("id", webhookLogId);
  }

  return {
    success: true,
    duplicate: false,
    ignoredOutOfOrder: false,
    normalizedStatus: norm.normalizedStatus,
    displayLabel: norm.displayLabel,
    consignmentId: effectiveConsignmentId || null,
    orderId: targetOrderId,
    dispatchId: dispatch?.id || null,
    shopifySynced,
    shopifySyncError,
    reconciliationRequired,
  };
}

