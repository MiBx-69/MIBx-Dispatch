import { createServiceClient } from "@/lib/supabase/server";
import { formatBstDate, resolveDateRange } from "@/lib/date-utils";

export const EXPENSE_CATEGORIES = [
  "Marketing",
  "Meta Ads",
  "Google Ads",
  "Salary",
  "Rent",
  "Showroom expenses",
  "Courier charges",
  "Packaging",
  "Internet",
  "Electricity",
  "Transport",
  "Miscellaneous",
] as const;

export const RETURN_REASONS = [
  "Customer refused",
  "Size issue",
  "Product quality issue",
  "Wrong product",
  "Delayed delivery",
  "Customer unavailable",
  "Duplicate order",
  "Other",
] as const;

export interface RawOrderRecord {
  id: string;
  shopify_order_id?: number | string | null;
  shopify_order_name: string;
  shopify_order_number?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  shipping_address?: any;
  line_items?: any[];
  total_price?: number | string | null;
  subtotal_price?: number | string | null;
  original_total_price?: number | string | null;
  original_subtotal_price?: number | string | null;
  shipping_charge?: number | string | null;
  discount_amount?: number | string | null;
  payment_method?: string | null;
  cod_amount?: number | string | null;
  financial_status?: string | null;
  fulfillment_status?: string | null;
  internal_status: string;
  is_archived?: boolean | null;
  pathao_consignment_id?: string | null;
  pathao_delivery_status?: string | null;
  return_reason?: string | null;
  return_delivery_fee?: number | string | null;
  shopify_created_at: string;
  delivered_at?: string | null;
  returned_at?: string | null;
  verified_at?: string | null;
  updated_at?: string | null;
}

export interface RawDispatchRecord {
  id: string;
  order_id: string;
  shopify_order_id?: number | string | null;
  shopify_order_name: string;
  consignment_id: string;
  pathao_order_status: string;
  delivery_fee?: number | string | null;
  amount_to_collect?: number | string | null;
  expected_cod?: number | string | null;
  actual_cod_collected?: number | string | null;
  return_charge?: number | string | null;
  other_deductions?: number | string | null;
  settlement_amount?: number | string | null;
  actual_received_amount?: number | string | null;
  settlement_date?: string | null;
  payment_reference?: string | null;
  settlement_status?: string | null;
  settlement_notes?: string | null;
  settlement_batch_id?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  recipient_address?: string | null;
  recipient_city?: number | null;
  recipient_zone?: number | null;
  is_cancelled?: boolean | null;
  dispatched_at: string;
  updated_at?: string | null;
}

export interface RawReturnRecord {
  id: string;
  return_reference?: string | null;
  order_id: string;
  dispatch_id?: string | null;
  consignment_id?: string | null;
  return_reason?: string | null;
  return_type: "full" | "partial" | "exchange" | string;
  return_source?: string | null;
  returned_items?: any[];
  order_total?: number | string | null;
  return_delivery_fee?: number | string | null;
  refund_amount?: number | string | null;
  returned_product_value?: number | string | null;
  original_order_quantity?: number | null;
  returned_quantity?: number | null;
  is_paid_return?: boolean | null;
  is_verified?: boolean | null;
  verification_status?: string | null;
  staff_responsible?: string | null;
  status: string;
  notes?: string | null;
  returned_at: string;
  processed_at?: string | null;
}

export interface RawTransactionRecord {
  id: string;
  type: "income" | "expense";
  amount: number | string;
  description: string;
  category: string;
  payment_method?: string | null;
  receipt_url?: string | null;
  reference_id?: string | null;
  is_courier_charge?: boolean | null;
  date: string;
  created_at?: string | null;
}

export interface ProductSkuPerformanceRow {
  key: string;
  productTitle: string;
  sku: string;
  variantTitle: string;
  orderedQty: number;
  dispatchedQty: number;
  deliveredQty: number;
  returnedQty: number;
  grossOrderedValue: number;
  deliveredSalesValue: number;
  returnedProductValue: number;
  netSalesValue: number;
  orderCount: number;
  returnedOrderCount: number;
  unitReturnRate: number;
  valueReturnRate: number;
}

export interface DailyMetricPoint {
  date: string;
  ordersCount: number;
  grossOrderValue: number;
  productSubtotalValue: number;
  deliveredCount: number;
  deliveredSalesValue: number;
  returnedCount: number;
  returnedValue: number;
  netSalesValue: number;
  dispatchedCount: number;
  courierFees: number;
  expenses: number;
}

export interface ReturnReasonBreakdownItem {
  reason: string;
  count: number;
  value: number;
  percentage: number;
}

export interface ExpenseCategoryBreakdownItem {
  category: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface BusinessMetricsReport {
  periodLabel: string;
  period: {
    startDateIso: string;
    endDateIso: string;
    startDateBst: string;
    endDateBst: string;
  };
  // Section 1: Order Performance
  orderPerformance: {
    totalOrdersReceived: number;
    verifiedOrdersCount: number;
    pendingOrdersCount: number;
    preparingOrdersCount: number;
    holdOrdersCount: number;
    dispatchedOrdersCount: number;
    inTransitOrdersCount: number;
    deliveredOrdersCount: number;
    partiallyDeliveredOrdersCount: number;
    fullyReturnedOrdersCount: number;
    cancelledOrdersCount: number;
    failedDeliveriesCount: number;
    eligibleDispatchedOrdersCount: number;
    finalizedEligibleOrdersCount: number;
  };
  // Section 2: Sales Performance
  salesPerformance: {
    grossOrderValue: number;
    originalProductSalesValue: number;
    shippingChargesCollected: number;
    discountsGiven: number;
    cancelledOrderValue: number;
    dispatchedOrderValue: number;
    inTransitOrderValue: number;
    deliveredGrossSalesValue: number;
    deliveredProductSalesValue: number;
    partialReturnedValueOnDelivered: number;
    netSalesAfterReturns: number;
    averageOrderValue: number;
    averageDeliveredOrderValue: number;
  };
  // Section 3: Return Performance
  returnPerformance: {
    totalReturnRecordsCount: number;
    fullReturnsCount: number;
    partialReturnsCount: number;
    paidReturnsCount: number;
    ordersWithAnyReturnCount: number;
    unverifiedReturnsCount: number;
    inTransitReturnsCount: number;
    fullReturnedProductValue: number;
    partialReturnedProductValue: number;
    paidReturnedProductValue: number;
    totalReturnedProductValue: number;
    totalRefundAmount: number;
    totalReturnDeliveryFees: number;
    // The 3 required Return Rate Formulas with explicit denominators
    orderReturnRate: number; // (full + partial returned orders) / eligible dispatched orders * 100
    returnedValuePercentage: number; // returned product value / eligible dispatched product value * 100
    finalizedOrderReturnRate: number; // (full + partial returned orders) / finalized eligible orders * 100
    returnReasonBreakdown: ReturnReasonBreakdownItem[];
  };
  // Section 4: Delivery & Courier Performance
  deliveryPerformance: {
    deliverySuccessRate: number; // finalized delivered / finalized eligible * 100
    returnRate: number; // finalized returned / finalized eligible * 100
    cancellationRate: number; // cancelled / total received * 100
    failedDeliveryRate: number; // (returned + failed/hold) / eligible dispatched * 100
    averageDeliveryTimeHours: number;
    averageDeliveryTimeDays: number;
    averageReturnProcessingTimeHours: number;
    averageReturnProcessingTimeDays: number;
  };
  // Section 5: Pathao / Courier Settlement & COD Reconciliation
  courierPerformance: {
    totalParcelsDispatched: number;
    deliveredParcelsCount: number;
    partialDeliveredParcelsCount: number;
    returnedParcelsCount: number;
    paidReturnParcelsCount: number;
    inTransitParcelsCount: number;
    holdOrFailedParcelsCount: number;
    totalExpectedCodOnDispatched: number;
    totalExpectedCodOnDelivered: number;
    totalActualCodCollected: number;
    totalForwardDeliveryCharges: number;
    totalReturnDeliveryCharges: number;
    totalOtherDeductions: number;
    totalCourierCharges: number;
    netExpectedCourierPayable: number; // Collected COD - Total Courier Charges
    actualCourierPaymentReceived: number;
    outstandingCourierBalance: number; // Net Expected Payable - Actual Received
    pendingCodInTransit: number;
    settledParcelsCount: number;
    partiallySettledParcelsCount: number;
    unsettledParcelsCount: number;
    disputedParcelsCount: number;
  };
  // Section 6: Business Finance & Operating Result
  financialPerformance: {
    grossOrderValue: number;
    deliveredSalesValue: number;
    totalReturnedValue: number;
    netSalesAfterReturns: number;
    totalCourierCharges: number;
    recordedOperatingExpenses: number;
    courierExpensesInTransactions: number;
    totalAllRecordedExpenses: number;
    otherRecordedIncome: number;
    courierSettlementsInTransactions: number;
    recordedOperatingResult: number; // Net Sales After Returns - Total Courier Charges - Recorded Operating Expenses (non-courier) + Other Income
    cashRealizedResult: number; // Actual Courier Received + Direct Income - Total Recorded Expenses
    expenseCategoryBreakdown: ExpenseCategoryBreakdownItem[];
  };
  // Section 7: Product & SKU Performance
  productPerformance: ProductSkuPerformanceRow[];
  skuPerformance: ProductSkuPerformanceRow[];
  // Section 8: Daily Trend
  dailyTrend: DailyMetricPoint[];
}

export interface PeriodComparisonMetric {
  current: number;
  previous: number;
  delta: number;
  percentChange: number;
}

export interface PeriodComparisonSummary {
  totalOrdersReceived: PeriodComparisonMetric;
  grossOrderValue: PeriodComparisonMetric;
  deliveredSalesValue: PeriodComparisonMetric;
  netSalesAfterReturns: PeriodComparisonMetric;
  totalReturnedProductValue: PeriodComparisonMetric;
  orderReturnRate: PeriodComparisonMetric;
  finalizedOrderReturnRate: PeriodComparisonMetric;
  deliverySuccessRate: PeriodComparisonMetric;
  totalCourierCharges: PeriodComparisonMetric;
  recordedOperatingExpenses: PeriodComparisonMetric;
  recordedOperatingResult: PeriodComparisonMetric;
}

/**
 * Resolve the non-destructive original total price of an order.
 * If an older partial return mutated `total_price` without setting `original_total_price`,
 * we reconstruct the original total safely.
 */
export function getOrderOriginalTotal(
  order: RawOrderRecord,
  orderPartialReturns: RawReturnRecord[] = []
): number {
  if (order.original_total_price != null && Number(order.original_total_price) > 0) {
    return Number(order.original_total_price);
  }
  const currentTotal = Number(order.total_price || 0);
  // Check if line_items has `original_quantity` marker from legacy destructive partial return
  const hasLegacyMutation = Array.isArray(order.line_items) &&
    order.line_items.some((item: any) => item && item.original_quantity != null && Number(item.original_quantity) > Number(item.quantity));
  if (hasLegacyMutation && orderPartialReturns.length > 0) {
    const partialSum = orderPartialReturns
      .filter((r) => r.is_verified !== false)
      .reduce((acc, r) => acc + Number(r.returned_product_value || r.refund_amount || 0), 0);
    return currentTotal + partialSum;
  }
  return currentTotal;
}

export function getOrderOriginalSubtotal(
  order: RawOrderRecord,
  orderPartialReturns: RawReturnRecord[] = []
): number {
  if (order.original_subtotal_price != null && Number(order.original_subtotal_price) > 0) {
    return Number(order.original_subtotal_price);
  }
  const hasLegacyMutation =
    Array.isArray(order.line_items) &&
    order.line_items.some(
      (item: any) =>
        item &&
        item.original_quantity != null &&
        Number(item.original_quantity) > Number(item.quantity)
    );
  if (hasLegacyMutation && Array.isArray(order.line_items) && order.line_items.length > 0) {
    const sum = order.line_items.reduce((acc: number, item: any) => {
      const qty = Number(item?.original_quantity ?? item?.quantity ?? 1);
      const price = Number(item?.price ?? 0);
      return acc + qty * price;
    }, 0);
    if (sum > 0) return sum;
  }
  if (order.subtotal_price != null && Number(order.subtotal_price) > 0) {
    return Number(order.subtotal_price);
  }
  // Sum from line items if available
  if (Array.isArray(order.line_items) && order.line_items.length > 0) {
    const sum = order.line_items.reduce((acc: number, item: any) => {
      const qty = Number(item?.original_quantity ?? item?.quantity ?? 1);
      const price = Number(item?.price ?? 0);
      return acc + qty * price;
    }, 0);
    if (sum > 0) return sum;
  }
  return getOrderOriginalTotal(order, orderPartialReturns);
}

/**
 * Pure, deterministic calculation engine that takes raw records and computes the entire
 * BusinessMetricsReport without any double deductions or cohort mismatches.
 */
export function computeBusinessMetricsFromDataset(params: {
  orders: RawOrderRecord[];
  dispatches: RawDispatchRecord[];
  returns: RawReturnRecord[];
  transactions: RawTransactionRecord[];
  startDateIso: string;
  endDateIso: string;
  insideDhakaFeeDefault?: number;
  outsideDhakaFeeDefault?: number;
}): BusinessMetricsReport {
  const {
    orders,
    dispatches,
    returns,
    transactions,
    startDateIso,
    endDateIso,
    insideDhakaFeeDefault = 60,
    outsideDhakaFeeDefault = 120,
  } = params;

  const activeOrders = orders.filter((o) => !o.is_archived);
  const activeDispatches = dispatches.filter((d) => !d.is_cancelled);

  // Map returns by order_id
  const returnsByOrderId = new Map<string, RawReturnRecord[]>();
  for (const r of returns) {
    if (!r.order_id) continue;
    const list = returnsByOrderId.get(r.order_id) || [];
    list.push(r);
    returnsByOrderId.set(r.order_id, list);
  }

  // Map latest active dispatch by order_id
  const dispatchByOrderId = new Map<string, RawDispatchRecord>();
  for (const d of activeDispatches) {
    if (!d.order_id) continue;
    const existing = dispatchByOrderId.get(d.order_id);
    if (!existing || new Date(d.dispatched_at).getTime() >= new Date(existing.dispatched_at).getTime()) {
      dispatchByOrderId.set(d.order_id, d);
    }
  }

  // ─── 1. ORDER & SALES PERFORMANCE ──────────────────────────────────────────
  let totalOrdersReceived = 0;
  let verifiedOrdersCount = 0;
  let pendingOrdersCount = 0;
  let preparingOrdersCount = 0;
  let holdOrdersCount = 0;
  let dispatchedOrdersCount = 0;
  let inTransitOrdersCount = 0;
  let deliveredOrdersCount = 0;
  let partiallyDeliveredOrdersCount = 0;
  let fullyReturnedOrdersCount = 0;
  let cancelledOrdersCount = 0;
  let failedDeliveriesCount = 0;
  let eligibleDispatchedOrdersCount = 0;
  let finalizedEligibleOrdersCount = 0;

  let grossOrderValue = 0;
  let originalProductSalesValue = 0;
  let shippingChargesCollected = 0;
  let discountsGiven = 0;
  let cancelledOrderValue = 0;
  let dispatchedOrderValue = 0;
  let inTransitOrderValue = 0;
  let deliveredGrossSalesValue = 0;
  let deliveredProductSalesValue = 0;
  let partialReturnedValueOnDelivered = 0;
  let eligibleDispatchedProductValue = 0;

  // Delivery & Return duration accumulators
  let totalDeliveryHours = 0;
  let deliveryTimeSampleCount = 0;

  // Daily trend map
  const dailyMap = new Map<string, DailyMetricPoint>();
  const ensureDay = (dateStr: string): DailyMetricPoint => {
    const existing = dailyMap.get(dateStr);
    if (existing) return existing;
    const init: DailyMetricPoint = {
      date: dateStr,
      ordersCount: 0,
      grossOrderValue: 0,
      productSubtotalValue: 0,
      deliveredCount: 0,
      deliveredSalesValue: 0,
      returnedCount: 0,
      returnedValue: 0,
      netSalesValue: 0,
      dispatchedCount: 0,
      courierFees: 0,
      expenses: 0,
    };
    dailyMap.set(dateStr, init);
    return init;
  };

  // Product & SKU performance maps
  const productMap = new Map<string, ProductSkuPerformanceRow>();
  const skuMap = new Map<string, ProductSkuPerformanceRow>();

  const normalizeProductTitle = (raw: string): string => {
    if (!raw) return "Unknown Product";
    return raw.trim().replace(/\s*[-–—/]\s*(S|M|L|XL|XXL|2XL|3XL|Free Size|One Size|\d+)$/i, "").trim() || raw.trim();
  };

  // Track which orders in the cohort had full or partial returns
  let cohortFullReturnOrdersCount = 0;
  let cohortPartialReturnOrdersCount = 0;
  let cohortPaidReturnOrdersCount = 0;
  let cohortFullReturnedProductValue = 0;
  let cohortPartialReturnedProductValue = 0;
  let cohortPaidReturnedProductValue = 0;
  let cohortRefundAmount = 0;
  let cohortReturnDeliveryFees = 0;

  for (const order of activeOrders) {
    totalOrdersReceived++;
    const orderReturns = returnsByOrderId.get(order.id) || [];
    const partialReturns = orderReturns.filter((r) => r.return_type === "partial");
    const fullReturns = orderReturns.filter((r) => r.return_type === "full");

    const origTotal = getOrderOriginalTotal(order, partialReturns);
    const origSubtotal = getOrderOriginalSubtotal(order, partialReturns);
    const shipping = order.shipping_charge != null
      ? Number(order.shipping_charge)
      : Math.max(0, origTotal - origSubtotal);
    const discount = Number(order.discount_amount || 0);

    const status = (order.internal_status || "pending").toLowerCase();
    const pStatus = (order.pathao_delivery_status || "").toLowerCase();
    const dispatch = dispatchByOrderId.get(order.id);

    const orderDateBst = formatBstDate(order.shopify_created_at);
    const dayPoint = ensureDay(orderDateBst);
    dayPoint.ordersCount++;

    if (status === "cancelled") {
      cancelledOrdersCount++;
      cancelledOrderValue += origTotal;
      continue;
    }

    // Non-cancelled valid order
    grossOrderValue += origTotal;
    originalProductSalesValue += origSubtotal;
    shippingChargesCollected += shipping;
    discountsGiven += discount;

    dayPoint.grossOrderValue += origTotal;
    dayPoint.productSubtotalValue += origSubtotal;

    if (status === "pending" || status === "created") {
      pendingOrdersCount++;
    } else if (status === "preparing") {
      preparingOrdersCount++;
      verifiedOrdersCount++;
    } else if (status === "hold") {
      holdOrdersCount++;
      if (dispatch || order.pathao_consignment_id) {
        failedDeliveriesCount++;
      }
    }

    const wasDispatched =
      status === "dispatched" ||
      status === "delivered" ||
      status === "returned" ||
      status === "delayed" ||
      Boolean(dispatch) ||
      Boolean(order.pathao_consignment_id);

    if (wasDispatched) {
      verifiedOrdersCount++;
      dispatchedOrdersCount++;
      eligibleDispatchedOrdersCount++;
      dispatchedOrderValue += origTotal;
      eligibleDispatchedProductValue += origSubtotal;
      dayPoint.dispatchedCount++;
    }

    // Partial return value for this order (only verified partial returns count as finalized deduction)
    const verifiedPartialReturnVal = partialReturns
      .filter((r) => r.is_verified !== false && r.verification_status !== "rejected")
      .reduce((acc, r) => acc + Number(r.returned_product_value || r.refund_amount || 0), 0);

    const hasPartialReturn =
      partialReturns.length > 0 ||
      pStatus.includes("partial") ||
      verifiedPartialReturnVal > 0;

    const isPaidReturn =
      pStatus === "paid return" ||
      orderReturns.some((r) => Boolean(r.is_paid_return));

    if (status === "delivered") {
      deliveredOrdersCount++;
      finalizedEligibleOrdersCount++;
      deliveredGrossSalesValue += origTotal;
      deliveredProductSalesValue += origSubtotal;
      partialReturnedValueOnDelivered += verifiedPartialReturnVal;

      dayPoint.deliveredCount++;
      dayPoint.deliveredSalesValue += origTotal;
      dayPoint.netSalesValue += Math.max(0, origTotal - verifiedPartialReturnVal);

      if (hasPartialReturn) {
        partiallyDeliveredOrdersCount++;
        cohortPartialReturnOrdersCount++;
        cohortPartialReturnedProductValue += verifiedPartialReturnVal;
        cohortRefundAmount += verifiedPartialReturnVal;
        dayPoint.returnedCount++;
        dayPoint.returnedValue += verifiedPartialReturnVal;
      }

      // Delivery time calculation
      const startTs = dispatch?.dispatched_at || order.shopify_created_at;
      if (startTs && order.delivered_at) {
        const diffMs = new Date(order.delivered_at).getTime() - new Date(startTs).getTime();
        if (diffMs > 0 && diffMs < 90 * 24 * 3600 * 1000) {
          totalDeliveryHours += diffMs / (1000 * 3600);
          deliveryTimeSampleCount++;
        }
      }
    } else if (status === "returned") {
      fullyReturnedOrdersCount++;
      finalizedEligibleOrdersCount++;
      failedDeliveriesCount++;
      cohortFullReturnOrdersCount++;

      const fullRetVal = fullReturns.length > 0
        ? fullReturns.reduce((acc, r) => acc + Number(r.returned_product_value || r.refund_amount || origSubtotal), 0)
        : origSubtotal;

      cohortFullReturnedProductValue += fullRetVal;
      cohortRefundAmount += fullRetVal;

      if (isPaidReturn) {
        cohortPaidReturnOrdersCount++;
        cohortPaidReturnedProductValue += fullRetVal;
      }

      const retFee = isPaidReturn
        ? 0
        : Number(
            order.return_delivery_fee ||
              fullReturns[0]?.return_delivery_fee ||
              dispatch?.return_charge ||
              dispatch?.delivery_fee ||
              outsideDhakaFeeDefault
          );
      cohortReturnDeliveryFees += retFee;

      dayPoint.returnedCount++;
      dayPoint.returnedValue += fullRetVal;
    } else if (status === "dispatched" || status === "delayed") {
      inTransitOrdersCount++;
      inTransitOrderValue += origTotal;
      if (pStatus.includes("hold") || pStatus.includes("fail")) {
        failedDeliveriesCount++;
      }
    }

    // ─── Product & SKU Line Item Aggregation ─────────────────────────────────
    const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
    // Map returned quantities by item title/sku for this order
    const returnedQtyByKey = new Map<string, { qty: number; val: number }>();
    if (status === "returned") {
      for (const li of lineItems) {
        const itemKey = String(li?.variant_id || li?.sku || li?.title || "unknown");
        const q = Number(li?.original_quantity ?? li?.quantity ?? 1);
        const p = Number(li?.price ?? 0);
        returnedQtyByKey.set(itemKey, { qty: q, val: q * p });
      }
    } else if (hasPartialReturn) {
      for (const r of partialReturns) {
        const rItems = Array.isArray(r.returned_items) ? r.returned_items : [];
        for (const ri of rItems) {
          const itemKey = String(ri?.variant_id || ri?.sku || ri?.title || ri?.name || "unknown");
          const rq = Number(ri?.return_quantity ?? ri?.quantity ?? 0);
          const rp = Number(ri?.price ?? 0);
          if (rq > 0) {
            const prev = returnedQtyByKey.get(itemKey) || { qty: 0, val: 0 };
            returnedQtyByKey.set(itemKey, {
              qty: prev.qty + rq,
              val: prev.val + rq * rp,
            });
          }
        }
      }
    }

    for (const li of lineItems) {
      const rawTitle = String(li?.title || li?.name || "Unknown Product");
      const cleanTitle = normalizeProductTitle(rawTitle);
      const sku = String(li?.sku || "N/A").trim() || "N/A";
      const variantTitle = String(li?.variant_title || "").trim();
      const qty = Number(li?.original_quantity ?? li?.quantity ?? 1);
      const unitPrice = Number(li?.price ?? 0);
      const lineGross = qty * unitPrice;

      const itemKey = String(li?.variant_id || li?.sku || li?.title || "unknown");
      const retInfo = returnedQtyByKey.get(itemKey) || { qty: 0, val: 0 };
      const retQty = Math.min(qty, retInfo.qty);
      const retVal = retInfo.val > 0 ? retInfo.val : retQty * unitPrice;

      const dispQty = wasDispatched ? qty : 0;
      const delivQty = status === "delivered" ? Math.max(0, qty - retQty) : 0;
      const delivVal = status === "delivered" ? Math.max(0, lineGross - retVal) : 0;

      // Update Product aggregation
      const prodRow = productMap.get(cleanTitle) || {
        key: cleanTitle,
        productTitle: cleanTitle,
        sku: sku !== "N/A" ? sku : "Multiple",
        variantTitle: "",
        orderedQty: 0,
        dispatchedQty: 0,
        deliveredQty: 0,
        returnedQty: 0,
        grossOrderedValue: 0,
        deliveredSalesValue: 0,
        returnedProductValue: 0,
        netSalesValue: 0,
        orderCount: 0,
        returnedOrderCount: 0,
        unitReturnRate: 0,
        valueReturnRate: 0,
      };
      prodRow.orderedQty += qty;
      prodRow.dispatchedQty += dispQty;
      prodRow.deliveredQty += delivQty;
      prodRow.returnedQty += retQty;
      prodRow.grossOrderedValue += lineGross;
      prodRow.deliveredSalesValue += status === "delivered" ? lineGross : 0;
      prodRow.returnedProductValue += retVal;
      prodRow.netSalesValue += delivVal;
      prodRow.orderCount += 1;
      if (retQty > 0) prodRow.returnedOrderCount += 1;
      productMap.set(cleanTitle, prodRow);

      // Update SKU + Variant aggregation
      const skuKey = `${cleanTitle}::${sku}::${variantTitle}`;
      const skuRow = skuMap.get(skuKey) || {
        key: skuKey,
        productTitle: cleanTitle,
        sku,
        variantTitle: variantTitle || "Standard",
        orderedQty: 0,
        dispatchedQty: 0,
        deliveredQty: 0,
        returnedQty: 0,
        grossOrderedValue: 0,
        deliveredSalesValue: 0,
        returnedProductValue: 0,
        netSalesValue: 0,
        orderCount: 0,
        returnedOrderCount: 0,
        unitReturnRate: 0,
        valueReturnRate: 0,
      };
      skuRow.orderedQty += qty;
      skuRow.dispatchedQty += dispQty;
      skuRow.deliveredQty += delivQty;
      skuRow.returnedQty += retQty;
      skuRow.grossOrderedValue += lineGross;
      skuRow.deliveredSalesValue += status === "delivered" ? lineGross : 0;
      skuRow.returnedProductValue += retVal;
      skuRow.netSalesValue += delivVal;
      skuRow.orderCount += 1;
      if (retQty > 0) skuRow.returnedOrderCount += 1;
      skuMap.set(skuKey, skuRow);
    }
  }

  // Finalize Product & SKU Return Rates
  const finalizeProductRows = (rows: Iterable<ProductSkuPerformanceRow>): ProductSkuPerformanceRow[] => {
    const arr = Array.from(rows).map((r) => {
      const denomUnits = r.dispatchedQty > 0 ? r.dispatchedQty : r.orderedQty;
      const denomVal = r.grossOrderedValue > 0 ? r.grossOrderedValue : 1;
      return {
        ...r,
        unitReturnRate: denomUnits > 0 ? Number(((r.returnedQty / denomUnits) * 100).toFixed(2)) : 0,
        valueReturnRate: r.grossOrderedValue > 0 ? Number(((r.returnedProductValue / denomVal) * 100).toFixed(2)) : 0,
      };
    });
    return arr.sort((a, b) => b.grossOrderedValue - a.grossOrderedValue);
  };

  const productPerformance = finalizeProductRows(productMap.values());
  const skuPerformance = finalizeProductRows(skuMap.values());

  // ─── 2. RETURN RECORDS & RETURN REASON BREAKDOWN ───────────────────────────
  let unverifiedReturnsCount = 0;
  let inTransitReturnsCount = 0;
  let totalReturnProcessingHours = 0;
  let returnProcessingSampleCount = 0;
  const reasonMap = new Map<string, { count: number; value: number }>();

  for (const r of returns) {
    if (r.is_verified === false || r.verification_status === "unverified" || r.status === "pending_verification") {
      unverifiedReturnsCount++;
    }
    if (r.status === "in_transit") {
      inTransitReturnsCount++;
    }
    const reason = (r.return_reason || "Customer refused").trim();
    const val = Number(r.returned_product_value ?? r.refund_amount ?? r.order_total ?? 0);
    const prev = reasonMap.get(reason) || { count: 0, value: 0 };
    reasonMap.set(reason, { count: prev.count + 1, value: prev.value + val });

    if (r.returned_at && r.processed_at) {
      const diffMs = new Date(r.processed_at).getTime() - new Date(r.returned_at).getTime();
      if (diffMs > 0 && diffMs < 60 * 24 * 3600 * 1000) {
        totalReturnProcessingHours += diffMs / (1000 * 3600);
        returnProcessingSampleCount++;
      }
    }
  }

  // Also include any cohort orders marked returned whose reason wasn't in `returns`
  const totalReturnsForReasons = Math.max(1, returns.length || (cohortFullReturnOrdersCount + cohortPartialReturnOrdersCount));
  const returnReasonBreakdown: ReturnReasonBreakdownItem[] = Array.from(reasonMap.entries())
    .map(([reason, stats]) => ({
      reason,
      count: stats.count,
      value: stats.value,
      percentage: Number(((stats.count / totalReturnsForReasons) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count);

  const ordersWithAnyReturnCount = cohortFullReturnOrdersCount + cohortPartialReturnOrdersCount;
  const totalReturnedProductValue = cohortFullReturnedProductValue + cohortPartialReturnedProductValue;
  const netSalesAfterReturns = Math.max(0, deliveredGrossSalesValue - partialReturnedValueOnDelivered);

  // The 3 Required Return Rate Formulas
  const orderReturnRate = eligibleDispatchedOrdersCount > 0
    ? Number(((ordersWithAnyReturnCount / eligibleDispatchedOrdersCount) * 100).toFixed(2))
    : 0;

  const returnedValuePercentage = eligibleDispatchedProductValue > 0
    ? Number(((totalReturnedProductValue / eligibleDispatchedProductValue) * 100).toFixed(2))
    : 0;

  const finalizedOrderReturnRate = finalizedEligibleOrdersCount > 0
    ? Number(((ordersWithAnyReturnCount / finalizedEligibleOrdersCount) * 100).toFixed(2))
    : 0;

  // Delivery Performance Rates
  const pureDeliveredWithoutFullReturn = deliveredOrdersCount;
  const deliverySuccessRate = finalizedEligibleOrdersCount > 0
    ? Number(((pureDeliveredWithoutFullReturn / finalizedEligibleOrdersCount) * 100).toFixed(2))
    : 0;

  const cancellationRate = totalOrdersReceived > 0
    ? Number(((cancelledOrdersCount / totalOrdersReceived) * 100).toFixed(2))
    : 0;

  const failedDeliveryRate = eligibleDispatchedOrdersCount > 0
    ? Number(((failedDeliveriesCount / eligibleDispatchedOrdersCount) * 100).toFixed(2))
    : 0;

  const averageDeliveryTimeHours = deliveryTimeSampleCount > 0
    ? Number((totalDeliveryHours / deliveryTimeSampleCount).toFixed(1))
    : 0;
  const averageDeliveryTimeDays = Number((averageDeliveryTimeHours / 24).toFixed(1));

  const averageReturnProcessingTimeHours = returnProcessingSampleCount > 0
    ? Number((totalReturnProcessingHours / returnProcessingSampleCount).toFixed(1))
    : 0;
  const averageReturnProcessingTimeDays = Number((averageReturnProcessingTimeHours / 24).toFixed(1));

  // ─── 3. COURIER / PATHAO SETTLEMENT & COD RECONCILIATION ───────────────────
  let totalParcelsDispatched = 0;
  let deliveredParcelsCount = 0;
  let partialDeliveredParcelsCount = 0;
  let returnedParcelsCount = 0;
  let paidReturnParcelsCount = 0;
  let inTransitParcelsCount = 0;
  let holdOrFailedParcelsCount = 0;

  let totalExpectedCodOnDispatched = 0;
  let totalExpectedCodOnDelivered = 0;
  let totalActualCodCollected = 0;
  let totalForwardDeliveryCharges = 0;
  let totalReturnDeliveryCharges = 0;
  let totalOtherDeductions = 0;
  let actualCourierPaymentReceived = 0;
  let pendingCodInTransit = 0;

  let settledParcelsCount = 0;
  let partiallySettledParcelsCount = 0;
  let unsettledParcelsCount = 0;
  let disputedParcelsCount = 0;

  for (const d of activeDispatches) {
    totalParcelsDispatched++;
    const pStatus = (d.pathao_order_status || "Pending").toLowerCase().trim();
    const expectedCod = Number(d.expected_cod ?? d.amount_to_collect ?? 0);
    totalExpectedCodOnDispatched += expectedCod;

    // Default delivery charge fallback based on city (1 = Dhaka -> 60, else 120)
    const defaultForwardFee = d.recipient_city === 1 ? insideDhakaFeeDefault : outsideDhakaFeeDefault;
    const forwardFee = d.delivery_fee != null && Number(d.delivery_fee) > 0
      ? Number(d.delivery_fee)
      : defaultForwardFee;
    const returnCharge = Number(d.return_charge || 0);
    const otherDed = Number(d.other_deductions || 0);

    // Partial return deduction on this order if any
    const orderRets = returnsByOrderId.get(d.order_id) || [];
    const partialDed = orderRets
      .filter((r) => r.return_type === "partial" && r.is_verified !== false)
      .reduce((acc, r) => acc + Number(r.returned_product_value || r.refund_amount || 0), 0);

    const isDelivered = pStatus === "delivered" || pStatus === "partial delivered" || pStatus === "partial_delivery";
    const isPaidRet = pStatus === "paid return" || pStatus === "paid_return";
    const isReturned =
      pStatus === "returned" ||
      pStatus === "return" ||
      pStatus === "return completed" ||
      pStatus === "return_in_transit" ||
      pStatus === "return in transit" ||
      pStatus === "delivery_failed" ||
      pStatus === "delivery failed";

    if (isDelivered) {
      deliveredParcelsCount++;
      if (pStatus.includes("partial") || partialDed > 0) {
        partialDeliveredParcelsCount++;
      }
      const netExpectedForParcel = Math.max(0, expectedCod - partialDed);
      totalExpectedCodOnDelivered += netExpectedForParcel;
      const rawCollected = d.actual_cod_collected != null ? Number(d.actual_cod_collected) : 0;
      const collected =
        rawCollected > 0
          ? partialDed > 0 && rawCollected === expectedCod
            ? netExpectedForParcel
            : rawCollected
          : netExpectedForParcel;
      totalActualCodCollected += collected;
      totalForwardDeliveryCharges += forwardFee;
      totalReturnDeliveryCharges += returnCharge;
      totalOtherDeductions += otherDed;
    } else if (isPaidRet) {
      paidReturnParcelsCount++;
      // Customer paid the delivery/return charge on a paid return
      totalForwardDeliveryCharges += forwardFee;
      const collectedFee = d.actual_cod_collected != null && Number(d.actual_cod_collected) > 0
        ? Number(d.actual_cod_collected)
        : forwardFee;
      totalActualCodCollected += collectedFee;
    } else if (isReturned) {
      returnedParcelsCount++;
      const retFee = returnCharge > 0
        ? returnCharge
        : Number(orderRets[0]?.return_delivery_fee ?? forwardFee);
      totalReturnDeliveryCharges += retFee;
      totalOtherDeductions += otherDed;
    } else {
      inTransitParcelsCount++;
      pendingCodInTransit += expectedCod;
      if (pStatus.includes("hold") || pStatus.includes("fail")) {
        holdOrFailedParcelsCount++;
      }
    }

    const received = Number(d.actual_received_amount || 0);
    actualCourierPaymentReceived += received;

    const sStatus = (d.settlement_status || "pending").toLowerCase();
    if (sStatus === "settled") {
      settledParcelsCount++;
    } else if (sStatus === "partially_settled") {
      partiallySettledParcelsCount++;
    } else if (sStatus === "disputed") {
      disputedParcelsCount++;
    } else if (isDelivered || isPaidRet || isReturned) {
      unsettledParcelsCount++;
    }

    const dispDay = ensureDay(formatBstDate(d.dispatched_at));
    if (isDelivered || isPaidRet || isReturned) {
      dispDay.courierFees += forwardFee + returnCharge + otherDed;
    }
  }

  // If orders were marked returned without a dispatch row, include their return fees
  if (totalReturnDeliveryCharges === 0 && cohortReturnDeliveryFees > 0) {
    totalReturnDeliveryCharges = cohortReturnDeliveryFees;
  }

  const totalCourierCharges =
    totalForwardDeliveryCharges + totalReturnDeliveryCharges + totalOtherDeductions;
  const netExpectedCourierPayable = Math.max(
    0,
    totalActualCodCollected - totalCourierCharges
  );

  // ─── 4. EXPENSES & TRANSACTIONS ────────────────────────────────────────────
  let recordedOperatingExpenses = 0; // Excludes courier charges to prevent double counting
  let courierExpensesInTransactions = 0;
  let otherRecordedIncome = 0;
  let courierSettlementsInTransactions = 0;

  const expenseCatMap = new Map<string, { amount: number; count: number }>();

  for (const t of transactions) {
    const amt = Number(t.amount || 0);
    if (amt <= 0) continue;
    const cat = (t.category || "Miscellaneous").trim();
    const catLower = cat.toLowerCase();
    const txDay = ensureDay(formatBstDate(t.date));

    if (t.type === "expense") {
      const isCourier =
        Boolean(t.is_courier_charge) ||
        catLower === "courier charges" ||
        catLower === "courier/delivery";
      if (isCourier) {
        courierExpensesInTransactions += amt;
      } else {
        recordedOperatingExpenses += amt;
        txDay.expenses += amt;
      }
      const prev = expenseCatMap.get(cat) || { amount: 0, count: 0 };
      expenseCatMap.set(cat, { amount: prev.amount + amt, count: prev.count + 1 });
    } else if (t.type === "income") {
      if (catLower.includes("pathao") || catLower.includes("steadfast") || catLower.includes("courier") || catLower.includes("cod settlement")) {
        courierSettlementsInTransactions += amt;
      } else {
        otherRecordedIncome += amt;
      }
    }
  }

  // If parcel-level `actual_received_amount` wasn't recorded on individual dispatches,
  // incorporate recorded `Pathao COD Settlement` income transactions so settlement tracking stays accurate
  const effectiveCourierPaymentReceived = Math.max(
    actualCourierPaymentReceived,
    courierSettlementsInTransactions
  );
  const outstandingCourierBalance = Math.max(
    0,
    netExpectedCourierPayable - effectiveCourierPaymentReceived
  );

  const totalAllRecordedExpenses = recordedOperatingExpenses + courierExpensesInTransactions;
  const expenseCategoryBreakdown: ExpenseCategoryBreakdownItem[] = Array.from(expenseCatMap.entries())
    .map(([category, stats]) => ({
      category,
      amount: stats.amount,
      count: stats.count,
      percentage: totalAllRecordedExpenses > 0
        ? Number(((stats.amount / totalAllRecordedExpenses) * 100).toFixed(2))
        : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Recorded Operating Result = Net Sales After Returns - Total Courier Charges - Non-Courier Operating Expenses + Other Income
  const effectiveCourierCharges = totalCourierCharges > 0 ? totalCourierCharges : courierExpensesInTransactions;
  const recordedOperatingResult =
    netSalesAfterReturns - effectiveCourierCharges - recordedOperatingExpenses + otherRecordedIncome;

  const cashRealizedResult =
    effectiveCourierPaymentReceived + otherRecordedIncome - totalAllRecordedExpenses;

  const averageOrderValue =
    totalOrdersReceived - cancelledOrdersCount > 0
      ? Math.round(grossOrderValue / (totalOrdersReceived - cancelledOrdersCount))
      : 0;

  const averageDeliveredOrderValue =
    deliveredOrdersCount > 0
      ? Math.round(deliveredGrossSalesValue / deliveredOrdersCount)
      : 0;

  const dailyTrend = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const startDateBst = formatBstDate(startDateIso);
  const endDateBst = formatBstDate(endDateIso);

  return {
    periodLabel: `${startDateBst} to ${endDateBst}`,
    period: {
      startDateIso,
      endDateIso,
      startDateBst,
      endDateBst,
    },
    orderPerformance: {
      totalOrdersReceived,
      verifiedOrdersCount,
      pendingOrdersCount,
      preparingOrdersCount,
      holdOrdersCount,
      dispatchedOrdersCount,
      inTransitOrdersCount,
      deliveredOrdersCount,
      partiallyDeliveredOrdersCount,
      fullyReturnedOrdersCount,
      cancelledOrdersCount,
      failedDeliveriesCount,
      eligibleDispatchedOrdersCount,
      finalizedEligibleOrdersCount,
    },
    salesPerformance: {
      grossOrderValue,
      originalProductSalesValue,
      shippingChargesCollected,
      discountsGiven,
      cancelledOrderValue,
      dispatchedOrderValue,
      inTransitOrderValue,
      deliveredGrossSalesValue,
      deliveredProductSalesValue,
      partialReturnedValueOnDelivered,
      netSalesAfterReturns,
      averageOrderValue,
      averageDeliveredOrderValue,
    },
    returnPerformance: {
      totalReturnRecordsCount: Math.max(returns.length, ordersWithAnyReturnCount),
      fullReturnsCount: cohortFullReturnOrdersCount,
      partialReturnsCount: cohortPartialReturnOrdersCount,
      paidReturnsCount: cohortPaidReturnOrdersCount,
      ordersWithAnyReturnCount,
      unverifiedReturnsCount,
      inTransitReturnsCount,
      fullReturnedProductValue: cohortFullReturnedProductValue,
      partialReturnedProductValue: cohortPartialReturnedProductValue,
      paidReturnedProductValue: cohortPaidReturnedProductValue,
      totalReturnedProductValue,
      totalRefundAmount: cohortRefundAmount,
      totalReturnDeliveryFees: Math.max(cohortReturnDeliveryFees, totalReturnDeliveryCharges),
      orderReturnRate,
      returnedValuePercentage,
      finalizedOrderReturnRate,
      returnReasonBreakdown,
    },
    deliveryPerformance: {
      deliverySuccessRate,
      returnRate: finalizedOrderReturnRate,
      cancellationRate,
      failedDeliveryRate,
      averageDeliveryTimeHours,
      averageDeliveryTimeDays,
      averageReturnProcessingTimeHours,
      averageReturnProcessingTimeDays,
    },
    courierPerformance: {
      totalParcelsDispatched,
      deliveredParcelsCount,
      partialDeliveredParcelsCount,
      returnedParcelsCount,
      paidReturnParcelsCount,
      inTransitParcelsCount,
      holdOrFailedParcelsCount,
      totalExpectedCodOnDispatched,
      totalExpectedCodOnDelivered,
      totalActualCodCollected,
      totalForwardDeliveryCharges,
      totalReturnDeliveryCharges,
      totalOtherDeductions,
      totalCourierCharges: effectiveCourierCharges,
      netExpectedCourierPayable,
      actualCourierPaymentReceived: effectiveCourierPaymentReceived,
      outstandingCourierBalance,
      pendingCodInTransit,
      settledParcelsCount,
      partiallySettledParcelsCount,
      unsettledParcelsCount,
      disputedParcelsCount,
    },
    financialPerformance: {
      grossOrderValue,
      deliveredSalesValue: deliveredGrossSalesValue,
      totalReturnedValue: totalReturnedProductValue + cancelledOrderValue,
      netSalesAfterReturns,
      totalCourierCharges: effectiveCourierCharges,
      recordedOperatingExpenses,
      courierExpensesInTransactions,
      totalAllRecordedExpenses,
      otherRecordedIncome,
      courierSettlementsInTransactions,
      recordedOperatingResult,
      cashRealizedResult,
      expenseCategoryBreakdown,
    },
    productPerformance,
    skuPerformance,
    dailyTrend,
  };
}

export function computePeriodComparison(
  current: BusinessMetricsReport,
  previous: BusinessMetricsReport
): PeriodComparisonSummary {
  const compare = (curr: number, prev: number): PeriodComparisonMetric => {
    const delta = Number((curr - prev).toFixed(2));
    const percentChange =
      prev === 0
        ? curr > 0
          ? 100
          : 0
        : Number((((curr - prev) / Math.abs(prev)) * 100).toFixed(2));
    return { current: curr, previous: prev, delta, percentChange };
  };

  return {
    totalOrdersReceived: compare(
      current.orderPerformance.totalOrdersReceived,
      previous.orderPerformance.totalOrdersReceived
    ),
    grossOrderValue: compare(
      current.salesPerformance.grossOrderValue,
      previous.salesPerformance.grossOrderValue
    ),
    deliveredSalesValue: compare(
      current.salesPerformance.deliveredGrossSalesValue,
      previous.salesPerformance.deliveredGrossSalesValue
    ),
    netSalesAfterReturns: compare(
      current.salesPerformance.netSalesAfterReturns,
      previous.salesPerformance.netSalesAfterReturns
    ),
    totalReturnedProductValue: compare(
      current.returnPerformance.totalReturnedProductValue,
      previous.returnPerformance.totalReturnedProductValue
    ),
    orderReturnRate: compare(
      current.returnPerformance.orderReturnRate,
      previous.returnPerformance.orderReturnRate
    ),
    finalizedOrderReturnRate: compare(
      current.returnPerformance.finalizedOrderReturnRate,
      previous.returnPerformance.finalizedOrderReturnRate
    ),
    deliverySuccessRate: compare(
      current.deliveryPerformance.deliverySuccessRate,
      previous.deliveryPerformance.deliverySuccessRate
    ),
    totalCourierCharges: compare(
      current.courierPerformance.totalCourierCharges,
      previous.courierPerformance.totalCourierCharges
    ),
    recordedOperatingExpenses: compare(
      current.financialPerformance.recordedOperatingExpenses,
      previous.financialPerformance.recordedOperatingExpenses
    ),
    recordedOperatingResult: compare(
      current.financialPerformance.recordedOperatingResult,
      previous.financialPerformance.recordedOperatingResult
    ),
  };
}

/**
 * Helper to fetch all rows from a Supabase query builder using pagination (1000 rows per batch)
 * to avoid PostgREST's default 1000-row truncation.
 */
async function fetchAllPaginated<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>
): Promise<T[]> {
  const pageSize = 1000;
  let offset = 0;
  const allRows: T[] = [];
  while (true) {
    const { data, error } = await buildQuery(offset, offset + pageSize - 1);
    if (error || !data || data.length === 0) break;
    allRows.push(...(data as T[]));
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return allRows;
}

/**
 * Server-side function to fetch all cohort orders, dispatches, returns, and transactions
 * for a given date range (in `Asia/Dhaka` timezone) and compute the comprehensive report.
 * Supports both:
 *  - getComprehensiveBusinessReport(startDateIso, endDateIso, { includePreviousPeriod })
 *  - getComprehensiveBusinessReport(periodPreset, customStartDate, customEndDate)
 */
export async function getComprehensiveBusinessReport(
  startDateIsoOrPeriod: string,
  endDateIsoOrCustomStart?: string,
  optionsOrCustomEnd?: { includePreviousPeriod?: boolean } | string
): Promise<{
  report: BusinessMetricsReport;
  previousReport?: BusinessMetricsReport;
  current: BusinessMetricsReport;
  previous?: BusinessMetricsReport;
  comparison?: PeriodComparisonSummary;
  rawOrders: RawOrderRecord[];
  rawDispatches: RawDispatchRecord[];
  rawReturns: RawReturnRecord[];
  rawTransactions: RawTransactionRecord[];
}> {
  let startDateIso = startDateIsoOrPeriod;
  let endDateIso = endDateIsoOrCustomStart || new Date().toISOString();
  let includePreviousPeriod =
    typeof optionsOrCustomEnd === "object" && optionsOrCustomEnd !== null
      ? Boolean(optionsOrCustomEnd.includePreviousPeriod)
      : true;

  const periodPresets = new Set([
    "today",
    "yesterday",
    "week",
    "last_7_days",
    "month",
    "this_month",
    "last_month",
    "last_30_days",
    "custom",
    "year",
    "all",
  ]);
  if (periodPresets.has(startDateIsoOrPeriod)) {
    const filterKey =
      startDateIsoOrPeriod === "month"
        ? "this_month"
        : startDateIsoOrPeriod === "week"
          ? "last_7_days"
          : startDateIsoOrPeriod;
    const customStart = endDateIsoOrCustomStart;
    const customEnd = typeof optionsOrCustomEnd === "string" ? optionsOrCustomEnd : undefined;
    const { startDateStr, endDateStr } = resolveDateRange(filterKey, customStart, customEnd);
    startDateIso = startDateStr || new Date(Date.now() - 30 * 86400000).toISOString();
    endDateIso = endDateStr || new Date().toISOString();
  }

  const supabase = createServiceClient();

  // Fetch delivery fee settings
  const { data: settings } = await supabase
    .from("app_settings")
    .select("delivery_charge_inside_dhaka, delivery_charge_outside_dhaka")
    .limit(1)
    .maybeSingle();

  const insideFee = Number(settings?.delivery_charge_inside_dhaka ?? 60);
  const outsideFee = Number(settings?.delivery_charge_outside_dhaka ?? 120);

  // Fetch cohort orders in [startDateIso, endDateIso]
  const rawOrders = await fetchAllPaginated<RawOrderRecord>((from, to) =>
    supabase
      .from("orders")
      .select("*")
      .eq("is_archived", false)
      .gte("shopify_created_at", startDateIso)
      .lte("shopify_created_at", endDateIso)
      .order("shopify_created_at", { ascending: false })
      .range(from, to)
  );

  const orderIds = rawOrders.map((o) => o.id);

  // Fetch dispatches linked to cohort orders OR dispatched within date range
  let rawDispatches: RawDispatchRecord[] = [];
  if (orderIds.length > 0) {
    const chunkSize = 300;
    const byOrderDispatches: RawDispatchRecord[] = [];
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize);
      const { data } = await supabase
        .from("dispatches")
        .select("*")
        .in("order_id", chunk)
        .eq("is_cancelled", false);
      if (data) byOrderDispatches.push(...(data as RawDispatchRecord[]));
    }
    rawDispatches = byOrderDispatches;
  } else {
    rawDispatches = await fetchAllPaginated<RawDispatchRecord>((from, to) =>
      supabase
        .from("dispatches")
        .select("*")
        .eq("is_cancelled", false)
        .gte("dispatched_at", startDateIso)
        .lte("dispatched_at", endDateIso)
        .range(from, to)
    );
  }

  // Fetch returns linked to cohort orders OR returned within date range
  let rawReturns: RawReturnRecord[] = [];
  if (orderIds.length > 0) {
    const chunkSize = 300;
    const byOrderReturns: RawReturnRecord[] = [];
    for (let i = 0; i < orderIds.length; i += chunkSize) {
      const chunk = orderIds.slice(i, i + chunkSize);
      const { data } = await supabase
        .from("returns")
        .select("*")
        .in("order_id", chunk);
      if (data) byOrderReturns.push(...(data as RawReturnRecord[]));
    }
    rawReturns = byOrderReturns;
  } else {
    rawReturns = await fetchAllPaginated<RawReturnRecord>((from, to) =>
      supabase
        .from("returns")
        .select("*")
        .gte("returned_at", startDateIso)
        .lte("returned_at", endDateIso)
        .range(from, to)
    );
  }

  // Fetch transactions in [startDateIso, endDateIso]
  const rawTransactions = await fetchAllPaginated<RawTransactionRecord>((from, to) =>
    supabase
      .from("transactions")
      .select("*")
      .gte("date", startDateIso)
      .lte("date", endDateIso)
      .order("date", { ascending: false })
      .range(from, to)
  );

  const report = computeBusinessMetricsFromDataset({
    orders: rawOrders,
    dispatches: rawDispatches,
    returns: rawReturns,
    transactions: rawTransactions,
    startDateIso,
    endDateIso,
    insideDhakaFeeDefault: insideFee,
    outsideDhakaFeeDefault: outsideFee,
  });

  if (includePreviousPeriod) {
    const startMs = new Date(startDateIso).getTime();
    const endMs = new Date(endDateIso).getTime();
    const durationMs = Math.max(24 * 3600 * 1000, endMs - startMs);
    const prevEndIso = new Date(startMs - 1000).toISOString();
    const prevStartIso = new Date(startMs - durationMs - 1000).toISOString();

    const { report: previousReport } = await getComprehensiveBusinessReport(
      prevStartIso,
      prevEndIso,
      { includePreviousPeriod: false }
    );
    const comparison = computePeriodComparison(report, previousReport);
    return {
      report,
      previousReport,
      current: report,
      previous: previousReport,
      comparison,
      rawOrders,
      rawDispatches,
      rawReturns,
      rawTransactions,
    };
  }

  return {
    report,
    current: report,
    rawOrders,
    rawDispatches,
    rawReturns,
    rawTransactions,
  };
}

