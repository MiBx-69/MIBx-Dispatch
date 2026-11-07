import { createServiceClient } from "@/lib/supabase/server";
import { shopifyFetch, updateShopifyOrder } from "@/lib/shopify/client";
import {
  normalizeOrderLineItemsForReturn,
  calculateOrderReturnPreview,
  getSimpleOrderReturnClassification,
  type OrderLineItemNormalized,
  type ReturnLineItemSelection,
  type CalculatedReturnItem,
  type RemainingOrderItem,
  type ReturnCalculationResult,
} from "@/lib/return-calculator";

export {
  normalizeOrderLineItemsForReturn,
  calculateOrderReturnPreview,
  getSimpleOrderReturnClassification,
  type OrderLineItemNormalized,
  type ReturnLineItemSelection,
  type CalculatedReturnItem,
  type RemainingOrderItem,
  type ReturnCalculationResult,
};

// ─── Shopify GraphQL Queries & Mutations for Return & Refund Sync ─────────────

const GET_SHOPIFY_ORDER_FOR_RETURN_QUERY = `
  query GetOrderForReturn($id: ID!) {
    order(id: $id) {
      id
      name
      displayFinancialStatus
      displayFulfillmentStatus
      totalPriceSet { shopMoney { amount currencyCode } }
      currentTotalPriceSet { shopMoney { amount currencyCode } }
      subtotalPriceSet { shopMoney { amount currencyCode } }
      currentSubtotalPriceSet { shopMoney { amount currencyCode } }
      totalShippingPriceSet { shopMoney { amount currencyCode } }
      totalTaxSet { shopMoney { amount currencyCode } }
      tags
      note
      lineItems(first: 50) {
        edges {
          node {
            id
            title
            variantTitle
            sku
            quantity
            currentQuantity
            refundableQuantity
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            discountedUnitPriceSet { shopMoney { amount currencyCode } }
          }
        }
      }
      fulfillments {
        id
        status
        fulfillmentLineItems(first: 50) {
          edges {
            node {
              id
              quantity
              lineItem { id }
            }
          }
        }
      }
      refunds(first: 20) {
        id
        note
        createdAt
        totalRefundedSet { shopMoney { amount currencyCode } }
      }
    }
  }
`;

const SUGGESTED_REFUND_QUERY = `
  query GetSuggestedRefund($id: ID!, $refundLineItems: [RefundLineItemInput!], $refundShipping: Boolean) {
    order(id: $id) {
      id
      suggestedRefund(refundLineItems: $refundLineItems, refundShipping: $refundShipping) {
        amountSet { shopMoney { amount currencyCode } }
        subtotalSet { shopMoney { amount currencyCode } }
        totalTaxSet { shopMoney { amount currencyCode } }
        maximumRefundableSet { shopMoney { amount currencyCode } }
        suggestedTransactions {
          amountSet { shopMoney { amount currencyCode } }
          gateway
          kind
          parentTransaction { id }
        }
      }
    }
  }
`;

const CREATE_SHOPIFY_RETURN_MUTATION = `
  mutation CreateShopifyReturn($returnInput: ReturnInput!) {
    returnCreate(returnInput: $returnInput) {
      return {
        id
        name
        status
        totalQuantity
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const CREATE_SHOPIFY_REFUND_MUTATION = `
  mutation CreateShopifyRefund($input: RefundInput!) {
    refundCreate(input: $input) {
      refund {
        id
        note
        totalRefundedSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
      order {
        id
        displayFinancialStatus
        currentTotalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Synchronize a Partial Return or Full Return with Shopify via Admin GraphQL API.
 * 1. Fetches the Shopify order, line items, and fulfillments.
 * 2. Prevents duplicate refunds by checking idempotency markers in existing Shopify refunds.
 * 3. Creates a Shopify Return (`returnCreate`) when fulfillment line items are eligible.
 * 4. Queries `suggestedRefund` and creates a Shopify Refund (`refundCreate`) for the exact returned quantities.
 * 5. Updates Shopify order tags ("Partial Return" or "Full Return") and note.
 */
export async function syncReturnAndRefundToShopify(params: {
  shopifyOrderId: string | number | null | undefined;
  returnType: "partial" | "full";
  orderOverallReturnStatus: "partial" | "full";
  returnedItems: CalculatedReturnItem[];
  refundShipping?: boolean;
  calculatedRefundAmount: number;
  returnReason: string;
  idempotencyKey: string;
}): Promise<{
  synced: boolean;
  shopifyReturnId: string | null;
  shopifyRefundId: string | null;
  shopifyRefundedAmount: number | null;
  shopifyFinancialStatus: string | null;
  updatedShopifyOrderTotal: number | null;
  error: string | null;
}> {
  const {
    shopifyOrderId,
    orderOverallReturnStatus,
    returnedItems,
    refundShipping = false,
    calculatedRefundAmount,
    returnReason,
    idempotencyKey,
  } = params;

  if (!shopifyOrderId) {
    return {
      synced: false,
      shopifyReturnId: null,
      shopifyRefundId: null,
      shopifyRefundedAmount: null,
      shopifyFinancialStatus: null,
      updatedShopifyOrderTotal: null,
      error: "Order does not have a Shopify Order ID.",
    };
  }

  const rawId = String(shopifyOrderId);
  const orderGid = rawId.startsWith("gid://shopify/Order/")
    ? rawId
    : `gid://shopify/Order/${rawId}`;

  try {
    // 1. Fetch Shopify Order details
    const orderRes = await shopifyFetch(GET_SHOPIFY_ORDER_FOR_RETURN_QUERY, {
      id: orderGid,
    });
    const shopifyOrder = orderRes.data?.order;
    if (!shopifyOrder) {
      return {
        synced: false,
        shopifyReturnId: null,
        shopifyRefundId: null,
        shopifyRefundedAmount: null,
        shopifyFinancialStatus: null,
        updatedShopifyOrderTotal: null,
        error: `Order ${orderGid} not found on Shopify.`,
      };
    }

    // 2. Check idempotency: if a refund with this idempotencyKey already exists on Shopify, reuse it!
    const existingRefunds: any[] = shopifyOrder.refunds || [];
    const matchingExistingRefund = existingRefunds.find(
      (r) => typeof r?.note === "string" && r.note.includes(idempotencyKey)
    );
    if (matchingExistingRefund) {
      return {
        synced: true,
        shopifyReturnId: null,
        shopifyRefundId: matchingExistingRefund.id,
        shopifyRefundedAmount: Number(
          matchingExistingRefund.totalRefundedSet?.shopMoney?.amount ??
            calculatedRefundAmount
        ),
        shopifyFinancialStatus: shopifyOrder.displayFinancialStatus || null,
        updatedShopifyOrderTotal: Number(
          shopifyOrder.currentTotalPriceSet?.shopMoney?.amount ?? 0
        ),
        error: null,
      };
    }

    // 3. Map local returned items to Shopify LineItem GIDs and FulfillmentLineItem GIDs
    const shopifyLineItems: any[] = (shopifyOrder.lineItems?.edges || []).map(
      (e: any) => e.node
    );
    const fulfillmentLineItemByLineItemGid = new Map<
      string,
      { fulfillmentLineItemId: string; quantity: number }
    >();
    const rawOrderFulfillments = shopifyOrder.fulfillments;
    const fulfillmentsList: any[] =
      rawOrderFulfillments?.nodes ||
      rawOrderFulfillments?.edges?.map((e: any) => e.node) ||
      (Array.isArray(rawOrderFulfillments) ? rawOrderFulfillments : []);
    for (const f of fulfillmentsList) {
      if (f.status === "CANCELLED" || f.status === "FAILURE") continue;
      for (const edge of f.fulfillmentLineItems?.edges || []) {
        const node = edge.node;
        if (node?.lineItem?.id && node?.id) {
          fulfillmentLineItemByLineItemGid.set(node.lineItem.id, {
            fulfillmentLineItemId: node.id,
            quantity: Number(node.quantity || 1),
          });
        }
      }
    }

    const refundLineItemsInput: Array<{
      lineItemId: string;
      quantity: number;
      restockType?: string;
    }> = [];
    const returnLineItemsInput: Array<{
      fulfillmentLineItemId: string;
      quantity: number;
      returnReason: string;
      returnReasonNote: string;
    }> = [];

    for (const retItem of returnedItems) {
      const rawItemId = String(retItem.line_item_id || retItem.id);
      const matchedNode = shopifyLineItems.find((node) => {
        const numericNodeId = String(node.id).replace("gid://shopify/LineItem/", "");
        if (numericNodeId === rawItemId || node.id === rawItemId) return true;
        if (retItem.sku && node.sku && String(node.sku) === String(retItem.sku))
          return true;
        if (
          retItem.title &&
          node.title &&
          String(node.title).toLowerCase() === String(retItem.title).toLowerCase()
        )
          return true;
        return false;
      });

      if (!matchedNode) continue;

      const refundableQty =
        matchedNode.refundableQuantity != null
          ? Number(matchedNode.refundableQuantity)
          : Number(matchedNode.currentQuantity ?? matchedNode.quantity ?? retItem.quantity);
      const safeQty = Math.min(retItem.quantity, Math.max(0, refundableQty));
      if (safeQty <= 0) continue;

      refundLineItemsInput.push({
        lineItemId: matchedNode.id,
        quantity: safeQty,
      });

      const fli = fulfillmentLineItemByLineItemGid.get(matchedNode.id);
      if (fli) {
        returnLineItemsInput.push({
          fulfillmentLineItemId: fli.fulfillmentLineItemId,
          quantity: Math.min(safeQty, fli.quantity),
          returnReason: mapToShopifyReturnReasonEnum(returnReason),
          returnReasonNote: returnReason.slice(0, 250),
        });
      }
    }

    let createdShopifyReturnId: string | null = null;
    let createdShopifyRefundId: string | null = null;
    let finalShopifyRefundedAmount: number | null = null;
    let finalFinancialStatus: string | null =
      shopifyOrder.displayFinancialStatus || null;
    let finalCurrentTotal: number | null = Number(
      shopifyOrder.currentTotalPriceSet?.shopMoney?.amount ?? 0
    );

    // 4. Create Shopify Return (`returnCreate`) if the order has fulfilled line items
    if (returnLineItemsInput.length > 0) {
      try {
        const retRes = await shopifyFetch(CREATE_SHOPIFY_RETURN_MUTATION, {
          returnInput: {
            orderId: orderGid,
            returnLineItems: returnLineItemsInput,
          },
        });
        const retPayload = retRes.data?.returnCreate;
        if (retPayload?.return?.id) {
          createdShopifyReturnId = retPayload.return.id;
        }
      } catch (retErr: any) {
        // Non-fatal if returnCreate is already open or unsupported on unfulfilled orders; we still proceed to refundCreate
        console.warn("[Shopify Return Sync] returnCreate note:", retErr?.message);
      }
    }

    // 5. Query `suggestedRefund` & Execute `refundCreate`
    if (refundLineItemsInput.length > 0) {
      let suggestedTransactions: any[] = [];
      let suggestedAmount = calculatedRefundAmount;
      try {
        const sugRes = await shopifyFetch(SUGGESTED_REFUND_QUERY, {
          id: orderGid,
          refundLineItems: refundLineItemsInput.map((r) => ({
            lineItemId: r.lineItemId,
            quantity: r.quantity,
          })),
          refundShipping,
        });
        const sug = sugRes.data?.order?.suggestedRefund;
        if (sug) {
          if (sug.amountSet?.shopMoney?.amount != null) {
            suggestedAmount = Number(sug.amountSet.shopMoney.amount);
          }
          if (Array.isArray(sug.suggestedTransactions)) {
            suggestedTransactions = sug.suggestedTransactions
              .filter((t: any) => t?.parentTransaction?.id)
              .map((t: any) => ({
                orderId: orderGid,
                gateway: t.gateway,
                kind: "REFUND",
                amount: String(t.amountSet?.shopMoney?.amount ?? suggestedAmount),
                parentId: t.parentTransaction.id,
              }));
          }
        }
      } catch (sugErr: any) {
        console.warn("[Shopify Return Sync] suggestedRefund fallback:", sugErr?.message);
      }

      const refundNote = `[MiBx Dispatch ${
        orderOverallReturnStatus === "full" ? "Full Return" : "Partial Return"
      }] ${returnReason} (Ref: ${idempotencyKey})`;

      const refundInput: Record<string, any> = {
        orderId: orderGid,
        note: refundNote,
        notify: false,
        refundLineItems: refundLineItemsInput,
        transactions: suggestedTransactions,
      };
      if (refundShipping) {
        refundInput.shipping = { fullRefund: true };
      }

      const refRes = await shopifyFetch(CREATE_SHOPIFY_REFUND_MUTATION, {
        input: refundInput,
      });
      const refPayload = refRes.data?.refundCreate;
      if (refPayload?.userErrors?.length > 0) {
        throw new Error(
          refPayload.userErrors.map((e: any) => e.message).join(", ")
        );
      }
      if (refPayload?.refund?.id) {
        createdShopifyRefundId = refPayload.refund.id;
        finalShopifyRefundedAmount = Number(
          refPayload.refund.totalRefundedSet?.shopMoney?.amount ??
            suggestedAmount
        );
      }
      if (refPayload?.order?.displayFinancialStatus) {
        finalFinancialStatus = refPayload.order.displayFinancialStatus;
      }
      if (refPayload?.order?.currentTotalPriceSet?.shopMoney?.amount != null) {
        finalCurrentTotal = Number(
          refPayload.order.currentTotalPriceSet.shopMoney.amount
        );
      }
    }

    // 6. Update Shopify Order Tags ("Partial Return" or "Full Return") and Note
    try {
      const currentTags: string[] = Array.isArray(shopifyOrder.tags)
        ? shopifyOrder.tags
        : [];
      const cleanedTags = currentTags.filter(
        (t) =>
          t !== "Partial Return" &&
          t !== "Full Return" &&
          t !== "Partial Delivery"
      );
      const targetTag =
        orderOverallReturnStatus === "full" ? "Full Return" : "Partial Return";
      cleanedTags.push(targetTag);

      const prevNote = shopifyOrder.note ? `${shopifyOrder.note}\n` : "";
      const summaryLine = `[MiBx Dispatch] ${targetTag}: ${returnedItems
        .map((i) => `${i.quantity}x ${i.name}`)
        .join(", ")} (Refund: BDT ${
        finalShopifyRefundedAmount ?? calculatedRefundAmount
      })`;

      await updateShopifyOrder({
        id: orderGid,
        tags: Array.from(new Set(cleanedTags)),
        note: `${prevNote}${summaryLine}`.slice(0, 4900),
      });
    } catch (tagErr: any) {
      console.warn("[Shopify Return Sync] Tag/note update warning:", tagErr?.message);
    }

    return {
      synced: true,
      shopifyReturnId: createdShopifyReturnId,
      shopifyRefundId: createdShopifyRefundId,
      shopifyRefundedAmount:
        finalShopifyRefundedAmount ?? calculatedRefundAmount,
      shopifyFinancialStatus: finalFinancialStatus,
      updatedShopifyOrderTotal: finalCurrentTotal,
      error: null,
    };
  } catch (err: any) {
    console.error("[Shopify Return Sync] Error syncing return to Shopify:", err);
    return {
      synced: false,
      shopifyReturnId: null,
      shopifyRefundId: null,
      shopifyRefundedAmount: null,
      shopifyFinancialStatus: null,
      updatedShopifyOrderTotal: null,
      error: err?.message || "Failed to synchronize return with Shopify",
    };
  }
}

function mapToShopifyReturnReasonEnum(reason: string): string {
  const r = (reason || "").toLowerCase();
  if (r.includes("size") || r.includes("small") || r.includes("large"))
    return "SIZE_TOO_SMALL";
  if (r.includes("defective") || r.includes("quality") || r.includes("damaged"))
    return "DEFECTIVE";
  if (r.includes("wrong")) return "WRONG_ITEM";
  if (r.includes("not as described")) return "NOT_AS_DESCRIBED";
  if (r.includes("style")) return "STYLE";
  if (r.includes("color")) return "COLOR";
  if (r.includes("unwanted") || r.includes("refused") || r.includes("mind"))
    return "UNWANTED";
  return "OTHER";
}

export function isShopifyExchange(data: {
  order?: any;
  refundData?: any;
  payload?: any;
}): boolean {
  const sources = [data.refundData, data.payload, data.order].filter(Boolean);

  for (const src of sources) {
    if (
      Array.isArray(src.exchange_line_items) &&
      src.exchange_line_items.length > 0
    )
      return true;
    if (
      Array.isArray(src.exchangeLineItems) &&
      src.exchangeLineItems.length > 0
    )
      return true;

    if (Array.isArray(src.returns)) {
      for (const ret of src.returns) {
        if (
          Array.isArray(ret.exchange_line_items) &&
          ret.exchange_line_items.length > 0
        )
          return true;
        if (
          Array.isArray(ret.exchangeLineItems) &&
          ret.exchangeLineItems.length > 0
        )
          return true;
        if (
          typeof ret.note === "string" &&
          ret.note.toLowerCase().includes("exchange")
        )
          return true;
      }
    }

    if (src.return) {
      if (
        Array.isArray(src.return.exchange_line_items) &&
        src.return.exchange_line_items.length > 0
      )
        return true;
      if (
        Array.isArray(src.return.exchangeLineItems) &&
        src.return.exchangeLineItems.length > 0
      )
        return true;
      if (
        typeof src.return.note === "string" &&
        src.return.note.toLowerCase().includes("exchange")
      )
        return true;
    }

    const returnItems = src.return_line_items || src.refund_line_items || [];
    if (Array.isArray(returnItems)) {
      for (const item of returnItems) {
        const reason = (item.return_reason || item.reason || "")
          .toString()
          .toLowerCase();
        if (reason === "exchange" || reason.includes("exchange")) return true;
        const rNote = (item.return_reason_note || item.note || "")
          .toString()
          .toLowerCase();
        if (rNote.includes("exchange")) return true;
      }
    }

    if (src.shopify_tags) {
      const tags = Array.isArray(src.shopify_tags)
        ? src.shopify_tags
        : [src.shopify_tags];
      if (
        tags.some(
          (t: any) =>
            typeof t === "string" && t.toLowerCase().includes("exchange")
        )
      )
        return true;
    }
    if (
      typeof src.tags === "string" &&
      src.tags.toLowerCase().includes("exchange")
    )
      return true;
    if (
      Array.isArray(src.tags) &&
      src.tags.some(
        (t: any) => typeof t === "string" && t.toLowerCase().includes("exchange")
      )
    )
      return true;

    if (
      typeof src.note === "string" &&
      src.note.toLowerCase().includes("exchange")
    )
      return true;
    if (
      typeof src.notes === "string" &&
      src.notes.toLowerCase().includes("exchange")
    )
      return true;
  }

  return false;
}

/**
 * Two-Way Webhook Synchronization:
 * Handles returns and refunds created directly in Shopify Admin (`refunds/create`,
 * `returns/create`, `returns/approve`, `returns/close`, `orders/updated`).
 * - Prevents duplicate imports if the return was initiated from MiBx Dispatch or already synced.
 * - Strictly classifies Partial Return vs Full Return by returned line-item quantities.
 * - Never uses "Admin Attention" or `pending_verification`.
 */
export async function handleShopifyRefundOrReturn({
  shopifyOrderId,
  refundData,
  topic,
}: {
  shopifyOrderId: number | string;
  refundData: any;
  topic: string;
}) {
  const supabase = createServiceClient();
  const numOrderId = Number(shopifyOrderId);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(
      "id, shopify_order_name, total_price, original_total_price, subtotal_price, original_subtotal_price, shipping_charge, discount_amount, total_tax, line_items, pathao_consignment_id, internal_status, cancel_reason, fulfillment_status, financial_status, created_at, shopify_tags, note"
    )
    .eq("shopify_order_id", numOrderId)
    .maybeSingle();

  if (orderErr || !order) {
    return { success: false, reason: "Order not found" };
  }

  // 1. Ignore exchanges
  if (isShopifyExchange({ order, refundData, payload: refundData })) {
    return {
      success: true,
      type: "exchange",
      status: "ignored",
      message: "Exchange detected. Not taken as return.",
    };
  }

  // 2. Ignore echoes from MiBx Dispatch's own `syncReturnAndRefundToShopify`
  const incomingNote = String(
    refundData?.note ||
      refundData?.return?.note ||
      (Array.isArray(refundData?.refunds)
        ? refundData.refunds[refundData.refunds.length - 1]?.note
        : "") ||
      ""
  );
  if (incomingNote.includes("[MiBx Dispatch")) {
    return {
      success: true,
      type: "echo_ignored",
      status: "already_synced",
      message: "Return originated from MiBx Dispatch; skipped duplicate import.",
    };
  }

  // 3. Extract external Shopify Refund ID / Return ID for idempotency
  const externalRefundId =
    topic === "refunds/create" && refundData?.id
      ? `gid://shopify/Refund/${refundData.id}`
      : Array.isArray(refundData?.refunds) && refundData.refunds.length > 0
        ? `gid://shopify/Refund/${
            refundData.refunds[refundData.refunds.length - 1].id
          }`
        : null;

  const externalReturnId =
    topic.startsWith("returns/") && refundData?.id
      ? String(refundData.id).startsWith("gid://")
        ? String(refundData.id)
        : `gid://shopify/Return/${refundData.id}`
      : null;

  if (externalRefundId) {
    const { data: dupRefund } = await supabase
      .from("returns")
      .select("id, return_type")
      .eq("shopify_refund_id", externalRefundId)
      .maybeSingle();
    if (dupRefund) {
      return {
        success: true,
        type: dupRefund.return_type,
        status: "deduplicated",
        message: "Shopify refund already recorded.",
      };
    }
  }

  if (externalReturnId) {
    const { data: dupReturn } = await supabase
      .from("returns")
      .select("id, return_type")
      .eq("shopify_return_id", externalReturnId)
      .maybeSingle();
    if (dupReturn) {
      return {
        success: true,
        type: dupReturn.return_type,
        status: "deduplicated",
        message: "Shopify return already recorded.",
      };
    }
  }

  // 4. Check if order is cancelled or never dispatched/fulfilled
  const { data: dispatch } = await supabase
    .from("dispatches")
    .select("id, consignment_id")
    .eq("order_id", order.id)
    .eq("is_cancelled", false)
    .maybeSingle();

  const consignmentId =
    order.pathao_consignment_id || dispatch?.consignment_id || null;
  const noteLower = incomingNote.toLowerCase();
  const isCancelled =
    order.internal_status === "cancelled" ||
    Boolean(order.cancel_reason) ||
    Boolean(refundData?.cancelled_at) ||
    Boolean(refundData?.cancel_reason) ||
    noteLower.includes("order canceled") ||
    noteLower.includes("order cancelled") ||
    refundData?.financial_status === "voided";

  if (isCancelled) {
    await supabase
      .from("orders")
      .update({
        internal_status: "cancelled",
        cancel_reason:
          order.cancel_reason ||
          refundData?.cancel_reason ||
          incomingNote ||
          "Cancelled via Shopify",
      })
      .eq("id", order.id);

    return {
      success: true,
      type: "cancelled",
      status: "cancelled",
      message: "Order is cancelled.",
    };
  }

  // 5. Extract returned line items and quantities from the webhook payload
  const rawRefundLineItems: any[] = [];
  let webhookRefundAmount = 0;

  if (
    Array.isArray(refundData?.refund_line_items) &&
    refundData.refund_line_items.length > 0
  ) {
    rawRefundLineItems.push(...refundData.refund_line_items);
    if (Array.isArray(refundData.transactions)) {
      webhookRefundAmount = refundData.transactions.reduce(
        (s: number, tx: any) => s + (Number(tx.amount) || 0),
        0
      );
    }
  } else if (
    Array.isArray(refundData?.return_line_items) &&
    refundData.return_line_items.length > 0
  ) {
    rawRefundLineItems.push(...refundData.return_line_items);
  } else if (Array.isArray(refundData?.refunds) && refundData.refunds.length > 0) {
    // Only take the latest refund if multiple refunds exist on orders/updated
    const latestRefund = refundData.refunds[refundData.refunds.length - 1];
    const latestRefundGid = latestRefund?.id
      ? `gid://shopify/Refund/${latestRefund.id}`
      : null;
    if (latestRefundGid) {
      const { data: alreadyRecorded } = await supabase
        .from("returns")
        .select("id, return_type")
        .eq("shopify_refund_id", latestRefundGid)
        .maybeSingle();
      if (alreadyRecorded) {
        return {
          success: true,
          type: alreadyRecorded.return_type,
          status: "deduplicated",
          message: "Latest Shopify refund already synchronized.",
        };
      }
    }
    if (Array.isArray(latestRefund?.refund_line_items)) {
      rawRefundLineItems.push(...latestRefund.refund_line_items);
    }
    if (Array.isArray(latestRefund?.transactions)) {
      webhookRefundAmount = latestRefund.transactions.reduce(
        (s: number, tx: any) => s + (Number(tx.amount) || 0),
        0
      );
    }
  }

  // Never classify an order as a return based solely on a monetary refund transaction without returned line-item quantities!
  const selections: ReturnLineItemSelection[] = [];
  for (const rli of rawRefundLineItems) {
    const qty = Number(rli?.quantity || 0);
    if (qty <= 0) continue;
    const itemKey = String(
      rli?.line_item_id ??
        rli?.line_item?.id ??
        rli?.fulfillment_line_item?.line_item_id ??
        rli?.line_item?.variant_id ??
        rli?.line_item?.sku ??
        rli?.line_item?.title ??
        ""
    );
    if (itemKey) {
      selections.push({ key: itemKey, quantity: qty });
    }
  }

  if (selections.length === 0) {
    return {
      success: true,
      type: "no_line_items",
      status: "ignored",
      message:
        "No returned line-item quantities in webhook payload; skipped return classification.",
    };
  }

  // 6. Fetch existing returns for this order to calculate remaining quantities accurately
  const { data: existingOrderReturns } = await supabase
    .from("returns")
    .select("*")
    .eq("order_id", order.id);

  const preview = calculateOrderReturnPreview({
    order,
    existingReturns: existingOrderReturns || [],
    mode: "partial",
    selections,
  });

  if (!preview.valid || preview.returnedQuantityNow <= 0) {
    return {
      success: true,
      type: "already_returned",
      status: "deduplicated",
      message: preview.error || "Quantities already returned.",
    };
  }

  const now = new Date().toISOString();
  const isFullNow = preview.orderOverallReturnStatus === "full";
  const finalReturnType: "partial" | "full" = isFullNow ? "full" : "partial";
  const finalRefundAmount =
    webhookRefundAmount > 0
      ? webhookRefundAmount
      : preview.calculatedRefundAmount;

  const idempotencyKey =
    externalRefundId ||
    externalReturnId ||
    `shopify-${order.id}-${preview.returnedItems
      .map((i) => `${i.id}:${i.quantity}`)
      .join(",")}-${existingOrderReturns?.length || 0}`;

  const financialStatus =
    refundData?.financial_status ||
    (isFullNow ? "refunded" : "partially_refunded");

  // 7. Insert the synchronized return record (always verified & synced, no Admin Attention!)
  await supabase.from("returns").insert({
    order_id: order.id,
    dispatch_id: dispatch?.id || null,
    consignment_id: consignmentId,
    return_type: finalReturnType,
    return_source: "shopify_webhook",
    order_total: preview.originalOrderAmount,
    returned_product_value: preview.returnedSubtotal,
    refund_amount: finalRefundAmount,
    original_order_quantity: preview.originalOrderQuantity,
    returned_quantity: preview.returnedQuantityNow,
    return_delivery_fee: 0,
    is_paid_return: false,
    status: "received",
    is_verified: true,
    verification_status: "verified",
    returned_items: preview.returnedItems as any,
    remaining_items: preview.remainingItems as any,
    return_reason: incomingNote || "Returned via Shopify Admin",
    shopify_return_id: externalReturnId,
    shopify_refund_id: externalRefundId,
    shopify_sync_status: "synced",
    shopify_sync_error: null,
    shopify_financial_status: financialStatus,
    idempotency_key: idempotencyKey,
    returned_at: now,
    processed_at: now,
  });

  // 8. Update Order & Dispatch status accurately
  if (isFullNow) {
    await supabase
      .from("orders")
      .update({
        internal_status: "returned",
        pathao_delivery_status: "Full Return",
        financial_status: financialStatus,
        returned_at: now,
        return_reason: incomingNote || "Full Return via Shopify",
      })
      .eq("id", order.id);

    if (dispatch?.id) {
      await supabase
        .from("dispatches")
        .update({
          pathao_order_status: "Returned",
          updated_at: now,
        })
        .eq("id", dispatch.id);
    }
  } else {
    // Partial Return: never mark the entire order as fully returned!
    await supabase
      .from("orders")
      .update({
        pathao_delivery_status: "Partial Return",
        financial_status: financialStatus,
      })
      .eq("id", order.id);

    if (dispatch?.id) {
      await supabase
        .from("dispatches")
        .update({
          pathao_order_status: "Partial Delivered",
          updated_at: now,
        })
        .eq("id", dispatch.id);
    }
  }

  const { logOrderEvent } = await import("@/lib/audit");
  await logOrderEvent(
    order.id,
    isFullNow ? "FULL_RETURN_SYNCED" : "PARTIAL_RETURN_SYNCED",
    `Shopify ${
      isFullNow ? "Full Return" : "Partial Return"
    } synchronized (${preview.returnedQuantityNow} unit(s), Refund: ৳${finalRefundAmount}).`
  ).catch(() => {});

  return {
    success: true,
    type: finalReturnType,
    status: isFullNow ? "full" : "partial",
    message: `Synchronized ${
      isFullNow ? "Full Return" : "Partial Return"
    } from Shopify.`,
  };
}
