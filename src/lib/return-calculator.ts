export interface OrderLineItemNormalized {
  key: string;
  lineItemId: string;
  variantId: string | null;
  sku: string | null;
  title: string;
  variantTitle: string | null;
  originalQuantity: number;
  alreadyReturnedQuantity: number;
  unreturnedQuantity: number;
  unitPrice: number;
  discountPerUnit: number;
  effectiveUnitPrice: number;
  taxPerUnit: number;
}

export interface ReturnLineItemSelection {
  key: string; // matches lineItemId, variantId, sku, or index
  quantity: number;
}

export interface CalculatedReturnItem {
  id: string;
  line_item_id: string;
  variant_id: string | null;
  sku: string | null;
  name: string;
  title: string;
  variant_title: string | null;
  price: number;
  original_unit_price: number;
  discount_per_unit: number;
  tax_per_unit: number;
  quantity: number;
  line_subtotal: number;
  line_tax: number;
  line_refund_total: number;
}

export interface RemainingOrderItem {
  id: string;
  sku: string | null;
  name: string;
  title: string;
  variant_title: string | null;
  price: number;
  original_quantity: number;
  returned_quantity: number;
  remaining_quantity: number;
}

export interface ReturnCalculationResult {
  valid: boolean;
  error?: string;
  returnType: "partial" | "full";
  orderOverallReturnStatus: "none" | "partial" | "full";
  originalOrderAmount: number;
  originalOrderSubtotal: number;
  originalOrderQuantity: number;
  previouslyReturnedQuantity: number;
  previouslyRefundedAmount: number;
  returnedQuantityNow: number;
  remainingQuantityAfter: number;
  returnedSubtotal: number;
  returnedDiscount: number;
  returnedTax: number;
  shippingRefund: number;
  calculatedRefundAmount: number;
  updatedOrderFinancialAmount: number;
  returnedItems: CalculatedReturnItem[];
  remainingItems: RemainingOrderItem[];
  normalizedLineItems: OrderLineItemNormalized[];
}

/**
 * Normalize an order's line items and compute already-returned quantities from existing return records.
 */
export function normalizeOrderLineItemsForReturn(
  order: {
    line_items?: any;
    total_price?: number | string | null;
    original_total_price?: number | string | null;
    subtotal_price?: number | string | null;
    original_subtotal_price?: number | string | null;
    discount_amount?: number | string | null;
    total_tax?: number | string | null;
  },
  existingReturns: Array<{
    id?: string;
    return_type?: string | null;
    returned_items?: any;
    returned_quantity?: number | null;
  }> = []
): OrderLineItemNormalized[] {
  const rawItems = Array.isArray(order.line_items) ? order.line_items : [];
  if (rawItems.length === 0) return [];

  const rawGrossSubtotal = rawItems.reduce((sum, item) => {
    const qty = Number(item?.original_quantity ?? item?.quantity ?? 1);
    const price = Number(item?.price ?? 0);
    return sum + qty * price;
  }, 0);

  const origSubtotal = Number(
    order.original_subtotal_price ?? order.subtotal_price ?? rawGrossSubtotal
  );

  const explicitDiscount = Number(order.discount_amount ?? 0);
  const inferredDiscount =
    explicitDiscount > 0
      ? explicitDiscount
      : rawGrossSubtotal > origSubtotal
        ? rawGrossSubtotal - origSubtotal
        : 0;
  const totalOrderTax = Number(order.total_tax ?? 0);

  const returnedByKey = new Map<string, number>();

  for (const ret of existingReturns) {
    const retItems = Array.isArray(ret.returned_items) ? ret.returned_items : [];
    if (retItems.length > 0) {
      for (const ri of retItems) {
        const q = Number(ri?.quantity ?? ri?.return_quantity ?? 0);
        if (q <= 0) continue;
        const candidateKeys = [
          ri?.line_item_id,
          ri?.id,
          ri?.variant_id,
          ri?.sku,
          ri?.title || ri?.name,
        ]
          .filter(Boolean)
          .map((k) => String(k));
        if (candidateKeys.length > 0) {
          const primaryKey = candidateKeys[0];
          returnedByKey.set(primaryKey, (returnedByKey.get(primaryKey) || 0) + q);
        }
      }
    } else if (ret.return_type === "full") {
      rawItems.forEach((item, idx) => {
        const key = String(item?.id ?? item?.variant_id ?? item?.sku ?? idx);
        const origQty = Number(item?.original_quantity ?? item?.quantity ?? 1);
        returnedByKey.set(key, origQty);
      });
    }
  }

  return rawItems.map((item, idx) => {
    const lineItemId = String(item?.id ?? item?.line_item_id ?? item?.variant_id ?? idx);
    const variantId = item?.variant_id != null ? String(item.variant_id) : null;
    const sku = item?.sku ? String(item.sku) : null;
    const title = String(item?.title || item?.name || `Item #${idx + 1}`);
    const variantTitle =
      item?.variant_title && item.variant_title !== "Default Title"
        ? String(item.variant_title)
        : null;
    const originalQuantity = Math.max(
      1,
      Number(item?.original_quantity ?? item?.quantity ?? 1)
    );
    const unitPrice = Number(item?.price ?? 0);

    let alreadyReturned = 0;
    const matchedKeys = new Set<string>();
    for (const candidate of [
      lineItemId,
      variantId,
      sku,
      title,
      variantTitle ? `${title} (${variantTitle})` : null,
    ]) {
      if (!candidate) continue;
      const k = String(candidate);
      if (returnedByKey.has(k) && !matchedKeys.has(k)) {
        alreadyReturned += returnedByKey.get(k) || 0;
        matchedKeys.add(k);
        break;
      }
    }
    alreadyReturned = Math.min(originalQuantity, alreadyReturned);
    const unreturnedQuantity = Math.max(0, originalQuantity - alreadyReturned);

    let lineTotalDiscount = 0;
    if (Array.isArray(item?.discount_allocations) && item.discount_allocations.length > 0) {
      lineTotalDiscount = item.discount_allocations.reduce(
        (s: number, da: any) =>
          s +
          Number(
            da?.amount ??
              da?.allocatedAmountSet?.shopMoney?.amount ??
              0
          ),
        0
      );
    } else if (item?.total_discount != null && Number(item.total_discount) > 0) {
      lineTotalDiscount = Number(item.total_discount);
    } else if (inferredDiscount > 0 && rawGrossSubtotal > 0) {
      const lineShare = (unitPrice * originalQuantity) / rawGrossSubtotal;
      lineTotalDiscount = inferredDiscount * lineShare;
    }

    const discountPerUnit =
      originalQuantity > 0 ? lineTotalDiscount / originalQuantity : 0;
    const effectiveUnitPrice = Math.max(0, unitPrice - discountPerUnit);

    let lineTotalTax = 0;
    if (Array.isArray(item?.tax_lines) && item.tax_lines.length > 0) {
      lineTotalTax = item.tax_lines.reduce(
        (s: number, tl: any) =>
          s + Number(tl?.price ?? tl?.priceSet?.shopMoney?.amount ?? 0),
        0
      );
    } else if (totalOrderTax > 0 && rawGrossSubtotal > 0) {
      const lineShare = (unitPrice * originalQuantity) / rawGrossSubtotal;
      lineTotalTax = totalOrderTax * lineShare;
    }
    const taxPerUnit = originalQuantity > 0 ? lineTotalTax / originalQuantity : 0;

    return {
      key: lineItemId,
      lineItemId,
      variantId,
      sku,
      title,
      variantTitle,
      originalQuantity,
      alreadyReturnedQuantity: alreadyReturned,
      unreturnedQuantity,
      unitPrice,
      discountPerUnit,
      effectiveUnitPrice,
      taxPerUnit,
    };
  });
}

/**
 * Pure, deterministic calculator for Partial Return and Full Return.
 */
export function calculateOrderReturnPreview(params: {
  order: {
    id?: string;
    line_items?: any;
    total_price?: number | string | null;
    original_total_price?: number | string | null;
    subtotal_price?: number | string | null;
    original_subtotal_price?: number | string | null;
    discount_amount?: number | string | null;
    total_tax?: number | string | null;
    shipping_charge?: number | string | null;
  };
  existingReturns?: Array<{
    id?: string;
    return_type?: string | null;
    returned_items?: any;
    returned_quantity?: number | null;
    refund_amount?: number | string | null;
    returned_product_value?: number | string | null;
  }>;
  mode: "partial" | "full";
  selections?: ReturnLineItemSelection[];
  refundShipping?: boolean;
}): ReturnCalculationResult {
  const {
    order,
    existingReturns = [],
    mode,
    selections = [],
    refundShipping = false,
  } = params;

  const normalized = normalizeOrderLineItemsForReturn(order, existingReturns);
  const origTotal = Number(order.original_total_price ?? order.total_price ?? 0);
  const origSubtotal = Number(
    order.original_subtotal_price ?? order.subtotal_price ?? origTotal
  );

  const originalOrderQuantity = normalized.reduce(
    (s, li) => s + li.originalQuantity,
    0
  );
  const previouslyReturnedQuantity = normalized.reduce(
    (s, li) => s + li.alreadyReturnedQuantity,
    0
  );
  const previouslyRefundedAmount = existingReturns.reduce(
    (s, r) => s + Number(r.refund_amount ?? r.returned_product_value ?? 0),
    0
  );
  const totalUnreturnedBefore = normalized.reduce(
    (s, li) => s + li.unreturnedQuantity,
    0
  );

  if (normalized.length === 0) {
    return {
      valid: false,
      error: "Order has no line items to return.",
      returnType: mode,
      orderOverallReturnStatus: "none",
      originalOrderAmount: origTotal,
      originalOrderSubtotal: origSubtotal,
      originalOrderQuantity: 0,
      previouslyReturnedQuantity: 0,
      previouslyRefundedAmount,
      returnedQuantityNow: 0,
      remainingQuantityAfter: 0,
      returnedSubtotal: 0,
      returnedDiscount: 0,
      returnedTax: 0,
      shippingRefund: 0,
      calculatedRefundAmount: 0,
      updatedOrderFinancialAmount: Math.max(0, origTotal - previouslyRefundedAmount),
      returnedItems: [],
      remainingItems: [],
      normalizedLineItems: [],
    };
  }

  if (totalUnreturnedBefore <= 0) {
    return {
      valid: false,
      error: "All products in this order have already been returned.",
      returnType: "full",
      orderOverallReturnStatus: "full",
      originalOrderAmount: origTotal,
      originalOrderSubtotal: origSubtotal,
      originalOrderQuantity,
      previouslyReturnedQuantity,
      previouslyRefundedAmount,
      returnedQuantityNow: 0,
      remainingQuantityAfter: 0,
      returnedSubtotal: 0,
      returnedDiscount: 0,
      returnedTax: 0,
      shippingRefund: 0,
      calculatedRefundAmount: 0,
      updatedOrderFinancialAmount: 0,
      returnedItems: [],
      remainingItems: normalized.map((li) => ({
        id: li.lineItemId,
        sku: li.sku,
        name: li.variantTitle ? `${li.title} (${li.variantTitle})` : li.title,
        title: li.title,
        variant_title: li.variantTitle,
        price: Number(li.effectiveUnitPrice.toFixed(2)),
        original_quantity: li.originalQuantity,
        returned_quantity: li.originalQuantity,
        remaining_quantity: 0,
      })),
      normalizedLineItems: normalized,
    };
  }

  const requestedQtyByKey = new Map<string, number>();
  if (mode === "full") {
    for (const li of normalized) {
      if (li.unreturnedQuantity > 0) {
        requestedQtyByKey.set(li.key, li.unreturnedQuantity);
      }
    }
  } else {
    for (const sel of selections) {
      const q = Number(sel.quantity || 0);
      if (q <= 0) continue;
      const matched = normalized.find(
        (li) =>
          li.key === String(sel.key) ||
          li.lineItemId === String(sel.key) ||
          (li.variantId && li.variantId === String(sel.key)) ||
          (li.sku && li.sku === String(sel.key))
      );
      if (!matched) {
        return {
          valid: false,
          error: `Product "${sel.key}" was not found in this order.`,
          returnType: "partial",
          orderOverallReturnStatus:
            previouslyReturnedQuantity > 0 ? "partial" : "none",
          originalOrderAmount: origTotal,
          originalOrderSubtotal: origSubtotal,
          originalOrderQuantity,
          previouslyReturnedQuantity,
          previouslyRefundedAmount,
          returnedQuantityNow: 0,
          remainingQuantityAfter: totalUnreturnedBefore,
          returnedSubtotal: 0,
          returnedDiscount: 0,
          returnedTax: 0,
          shippingRefund: 0,
          calculatedRefundAmount: 0,
          updatedOrderFinancialAmount: Math.max(
            0,
            origTotal - previouslyRefundedAmount
          ),
          returnedItems: [],
          remainingItems: [],
          normalizedLineItems: normalized,
        };
      }
      const totalRequestedForItem = (requestedQtyByKey.get(matched.key) || 0) + q;
      if (totalRequestedForItem > matched.unreturnedQuantity) {
        return {
          valid: false,
          error: `Cannot return ${totalRequestedForItem} of "${matched.title}" — only ${matched.unreturnedQuantity} unreturned unit(s) remaining.`,
          returnType: "partial",
          orderOverallReturnStatus:
            previouslyReturnedQuantity > 0 ? "partial" : "none",
          originalOrderAmount: origTotal,
          originalOrderSubtotal: origSubtotal,
          originalOrderQuantity,
          previouslyReturnedQuantity,
          previouslyRefundedAmount,
          returnedQuantityNow: 0,
          remainingQuantityAfter: totalUnreturnedBefore,
          returnedSubtotal: 0,
          returnedDiscount: 0,
          returnedTax: 0,
          shippingRefund: 0,
          calculatedRefundAmount: 0,
          updatedOrderFinancialAmount: Math.max(
            0,
            origTotal - previouslyRefundedAmount
          ),
          returnedItems: [],
          remainingItems: [],
          normalizedLineItems: normalized,
        };
      }
      requestedQtyByKey.set(matched.key, totalRequestedForItem);
    }
  }

  let returnedQuantityNow = 0;
  let returnedSubtotal = 0;
  let returnedDiscount = 0;
  let returnedTax = 0;
  const returnedItems: CalculatedReturnItem[] = [];
  const remainingItems: RemainingOrderItem[] = [];

  for (const li of normalized) {
    const retNow = requestedQtyByKey.get(li.key) || 0;
    returnedQuantityNow += retNow;

    if (retNow > 0) {
      const lineSub = retNow * li.effectiveUnitPrice;
      const lineDisc = retNow * li.discountPerUnit;
      const lineTx = retNow * li.taxPerUnit;
      returnedSubtotal += lineSub;
      returnedDiscount += lineDisc;
      returnedTax += lineTx;

      returnedItems.push({
        id: li.lineItemId,
        line_item_id: li.lineItemId,
        variant_id: li.variantId,
        sku: li.sku,
        name: li.variantTitle ? `${li.title} (${li.variantTitle})` : li.title,
        title: li.title,
        variant_title: li.variantTitle,
        price: Number(li.effectiveUnitPrice.toFixed(2)),
        original_unit_price: Number(li.unitPrice.toFixed(2)),
        discount_per_unit: Number(li.discountPerUnit.toFixed(2)),
        tax_per_unit: Number(li.taxPerUnit.toFixed(2)),
        quantity: retNow,
        line_subtotal: Number(lineSub.toFixed(2)),
        line_tax: Number(lineTx.toFixed(2)),
        line_refund_total: Number((lineSub + lineTx).toFixed(2)),
      });
    }

    const totalReturnedForLine = li.alreadyReturnedQuantity + retNow;
    const remForLine = Math.max(0, li.originalQuantity - totalReturnedForLine);
    remainingItems.push({
      id: li.lineItemId,
      sku: li.sku,
      name: li.variantTitle ? `${li.title} (${li.variantTitle})` : li.title,
      title: li.title,
      variant_title: li.variantTitle,
      price: Number(li.effectiveUnitPrice.toFixed(2)),
      original_quantity: li.originalQuantity,
      returned_quantity: totalReturnedForLine,
      remaining_quantity: remForLine,
    });
  }

  if (returnedQuantityNow <= 0) {
    return {
      valid: false,
      error: "Please select at least 1 product quantity to return.",
      returnType: mode,
      orderOverallReturnStatus:
        previouslyReturnedQuantity > 0 ? "partial" : "none",
      originalOrderAmount: origTotal,
      originalOrderSubtotal: origSubtotal,
      originalOrderQuantity,
      previouslyReturnedQuantity,
      previouslyRefundedAmount,
      returnedQuantityNow: 0,
      remainingQuantityAfter: totalUnreturnedBefore,
      returnedSubtotal: 0,
      returnedDiscount: 0,
      returnedTax: 0,
      shippingRefund: 0,
      calculatedRefundAmount: 0,
      updatedOrderFinancialAmount: Math.max(
        0,
        origTotal - previouslyRefundedAmount
      ),
      returnedItems: [],
      remainingItems,
      normalizedLineItems: normalized,
    };
  }

  const remainingQuantityAfter = Math.max(
    0,
    totalUnreturnedBefore - returnedQuantityNow
  );

  const effectiveReturnType: "partial" | "full" =
    remainingQuantityAfter === 0 && previouslyReturnedQuantity === 0
      ? "full"
      : mode === "full" && remainingQuantityAfter === 0
        ? "full"
        : "partial";

  const orderOverallReturnStatus: "none" | "partial" | "full" =
    remainingQuantityAfter === 0 ? "full" : "partial";

  const shippingRefundAmount = refundShipping
    ? Number(order.shipping_charge || 0)
    : 0;

  const calculatedRefundAmount = Number(
    (returnedSubtotal + returnedTax + shippingRefundAmount).toFixed(2)
  );
  const updatedOrderFinancialAmount = Number(
    Math.max(
      0,
      origTotal - previouslyRefundedAmount - calculatedRefundAmount
    ).toFixed(2)
  );

  return {
    valid: true,
    returnType: effectiveReturnType,
    orderOverallReturnStatus,
    originalOrderAmount: origTotal,
    originalOrderSubtotal: origSubtotal,
    originalOrderQuantity,
    previouslyReturnedQuantity,
    previouslyRefundedAmount,
    returnedQuantityNow,
    remainingQuantityAfter,
    returnedSubtotal: Number(returnedSubtotal.toFixed(2)),
    returnedDiscount: Number(returnedDiscount.toFixed(2)),
    returnedTax: Number(returnedTax.toFixed(2)),
    shippingRefund: Number(shippingRefundAmount.toFixed(2)),
    calculatedRefundAmount,
    updatedOrderFinancialAmount,
    returnedItems,
    remainingItems,
    normalizedLineItems: normalized,
  };
}

/**
 * Determine the simple order return status ("No Return", "Partial Return", or "Full Return")
 * strictly from actual returned line-item quantities vs total order quantities.
 */
export function getSimpleOrderReturnClassification(
  order: {
    line_items?: any;
    internal_status?: string | null;
  },
  returns: Array<{
    return_type?: string | null;
    returned_items?: any;
    returned_quantity?: number | null;
  }> = []
): "No Return" | "Partial Return" | "Full Return" {
  const normalized = normalizeOrderLineItemsForReturn(order, returns);
  const totalOrig = normalized.reduce((s, l) => s + l.originalQuantity, 0);
  const totalRet = normalized.reduce((s, l) => s + l.alreadyReturnedQuantity, 0);

  if (totalOrig > 0) {
    if (totalRet <= 0) {
      if (returns.some((r) => r.return_type === "full") || order.internal_status === "returned") {
        return "Full Return";
      }
      if (returns.length > 0) {
        return "Partial Return";
      }
      return "No Return";
    }
    if (totalRet >= Math.max(1, totalOrig)) {
      return "Full Return";
    }
    return "Partial Return";
  }

  if (returns.some((r) => r.return_type === "full") || order.internal_status === "returned") {
    return "Full Return";
  }
  if (returns.length > 0) {
    return "Partial Return";
  }
  return "No Return";
}

