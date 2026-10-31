import { createServiceClient } from "@/lib/supabase/server";
import { resolveDateRange } from "@/lib/date-utils";
export { formatBstDate, resolveDateRange } from "@/lib/date-utils";

export interface UnifiedReportMetrics {
  // Delivered
  deliveredCount: number;
  deliveredRevenue: number;
  deliveredItems: number;
  deliveredAOV: number;

  // Returns
  returnedCount: number;
  returnedValue: number;
  returnFees: number;
  pendingReturnsCount: number;
  processedReturnsCount: number;
  needsAttentionCount: number;
  fullReturnsCount?: number;
  partialReturnsCount?: number;
  paidReturnsCount?: number;
  orderReturnRate?: number;
  returnedValuePercentage?: number;
  finalizedOrderReturnRate?: number;

  // Dispatches
  dispatchedCount: number;
  amountToCollect: number;

  // Courier Reconciliation (Pathao Live Hermes Data)
  courierDeliveredCount: number;
  courierDeliveredValue: number;
  courierDeliveredFee?: number;
  courierPaidReturnCount: number;
  courierPaidReturnValue: number;
  courierPaidReturnFee: number;
  courierReturnedCount: number;
  courierReturnedValue: number;
  courierReturnedFee?: number;
  courierProcessingCount: number;
  courierProcessingValue: number;
  courierPickupIssueCount: number;
  courierPickupIssueValue: number;
  courierActiveTotalCount: number;
  courierActiveTotalValue: number;
  courierTotalCount: number;
  courierTotalValue: number;
  courierTotalCharges?: number;
  courierNetPayable?: number;
  courierSettledAmount?: number;
  courierOutstandingBalance?: number;

  // Overall
  totalOrders: number;
  grossOrderValue?: number;
  pendingOrdersCount: number;
  cancelledOrdersCount: number;
  netRevenue: number;
  recordedExpenses?: number;
  operatingResult?: number;

  // Range metadata
  dateFilter: string;
  startDateStr: string | null;
  endDateStr: string | null;
}

function computePartialReturnValue(r: any): number {
  if (Number(r.returned_product_value) > 0) return Number(r.returned_product_value);
  if (Number(r.refund_amount) > 0) return Number(r.refund_amount);
  if (Array.isArray(r.returned_items) && r.returned_items.length > 0) {
    const itemsSum = r.returned_items.reduce(
      (s: number, i: any) =>
        s + Number(i.price || 0) * Number(i.return_quantity ?? i.quantity ?? 0),
      0
    );
    if (itemsSum > 0) return itemsSum;
  }
  // Never fall back to full `order_total` for a partial return!
  return 0;
}

export async function getUnifiedReportMetrics(params: {
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}): Promise<UnifiedReportMetrics> {
  const supabase = createServiceClient();
  const dateFilter = params.dateFilter || (params.startDate && params.endDate ? "custom" : "all");
  const { startDateStr, endDateStr } = resolveDateRange(dateFilter, params.startDate, params.endDate);

  const startMs = startDateStr ? new Date(startDateStr).getTime() : null;
  const endMs = endDateStr ? new Date(endDateStr).getTime() : null;

  function isInDateRange(dateString?: string | null): boolean {
    if (!startMs || !endMs) return true;
    if (!dateString) return false;
    const time = new Date(dateString).getTime();
    return time >= startMs && time <= endMs;
  }

  // 1. Fetch Orders (exclude archived/removed)
  let ordersQuery = supabase
    .from("orders")
    .select(
      "id, shopify_order_name, customer_name, customer_phone, pathao_consignment_id, total_price, original_total_price, subtotal_price, original_subtotal_price, internal_status, line_items, shopify_created_at, delivered_at, returned_at, return_delivery_fee"
    )
    .eq("is_archived", false);

  // 2. Fetch Dispatches
  let dispatchesQuery = supabase
    .from("dispatches")
    .select(
      "id, order_id, shopify_order_name, recipient_name, recipient_phone, recipient_city, consignment_id, amount_to_collect, expected_cod, actual_cod_collected, delivery_fee, return_charge, other_deductions, actual_received_amount, settlement_status, is_cancelled, pathao_order_status, dispatched_at, orders(id, internal_status, is_archived, total_price, original_total_price)"
    )
    .not("consignment_id", "is", null);

  // 3. Fetch Returns
  let returnsQuery = supabase
    .from("returns")
    .select(
      "id, order_id, consignment_id, order_total, refund_amount, returned_product_value, return_type, returned_items, return_delivery_fee, status, is_verified, is_paid_return, returned_at, orders!inner(shopify_order_name, customer_name, customer_phone, shopify_created_at)"
    );

  // 4. Fetch Transactions (Expenses & Settlements)
  let transactionsQuery = supabase
    .from("transactions")
    .select("id, type, amount, category, is_courier_charge, date");

  if (startDateStr && endDateStr) {
    ordersQuery = ordersQuery.gte("shopify_created_at", startDateStr).lte("shopify_created_at", endDateStr);
    dispatchesQuery = dispatchesQuery.gte("dispatched_at", startDateStr).lte("dispatched_at", endDateStr);
    returnsQuery = returnsQuery.gte("returned_at", startDateStr).lte("returned_at", endDateStr);
    transactionsQuery = transactionsQuery.gte("date", startDateStr).lte("date", endDateStr);
  }

  const [
    { data: ordersData },
    { data: dispatchesData },
    { data: returnsData },
    { data: transactionsData },
  ] = await Promise.all([
    ordersQuery,
    dispatchesQuery,
    returnsQuery,
    transactionsQuery,
  ]);

  let allOrders: any[] = ordersData || [];
  let allDispatches: any[] = (dispatchesData || []).filter((d: any) => !d.orders?.is_archived);
  let allReturns: any[] = returnsData || [];
  const allTransactions: any[] = transactionsData || [];

  // Search filtering
  if (params.search) {
    const s = params.search.toLowerCase();
    allOrders = allOrders.filter(
      (o: any) =>
        (o.shopify_order_name && o.shopify_order_name.toLowerCase().includes(s)) ||
        (o.customer_name && o.customer_name.toLowerCase().includes(s)) ||
        (o.customer_phone && o.customer_phone.toLowerCase().includes(s)) ||
        (o.pathao_consignment_id && o.pathao_consignment_id.toLowerCase().includes(s))
    );
    allDispatches = allDispatches.filter(
      (d: any) =>
        (d.shopify_order_name && d.shopify_order_name.toLowerCase().includes(s)) ||
        (d.recipient_name && d.recipient_name.toLowerCase().includes(s)) ||
        (d.recipient_phone && d.recipient_phone.toLowerCase().includes(s)) ||
        (d.consignment_id && d.consignment_id.toLowerCase().includes(s))
    );
    allReturns = allReturns.filter(
      (r: any) =>
        (r.consignment_id && r.consignment_id.toLowerCase().includes(s)) ||
        (r.orders?.shopify_order_name && r.orders.shopify_order_name.toLowerCase().includes(s)) ||
        (r.orders?.customer_name && r.orders.customer_name.toLowerCase().includes(s)) ||
        (r.orders?.customer_phone && r.orders.customer_phone.toLowerCase().includes(s))
    );
  }

  const filteredOrders = allOrders.filter((o: any) => isInDateRange(o.shopify_created_at));
  const filteredDispatches = allDispatches.filter((d: any) => isInDateRange(d.dispatched_at));
  const filteredReturns = allReturns.filter((r: any) =>
    isInDateRange(r.returned_at || r.orders?.shopify_created_at)
  );

  // Map partial returns by order_id so we never double-deduct
  const partialReturnsByOrderId = new Map<string, number>();
  for (const r of filteredReturns) {
    if (r.return_type === "partial" && r.is_verified !== false) {
      const val = computePartialReturnValue(r);
      partialReturnsByOrderId.set(
        r.order_id,
        (partialReturnsByOrderId.get(r.order_id) || 0) + val
      );
    }
  }

  const getOrigOrderPrice = (o: any) =>
    Number(o.original_total_price ?? o.total_price ?? 0);

  // Delivered Calculations (non-destructive original value minus verified partial returns)
  const deliveredOrders = filteredOrders.filter((o: any) => o.internal_status === "delivered");
  const deliveredCount = deliveredOrders.length;
  const deliveredRevenue = Math.round(
    deliveredOrders.reduce((sum: number, o: any) => {
      const orig = getOrigOrderPrice(o);
      const partialDed = partialReturnsByOrderId.get(o.id) || 0;
      return sum + Math.max(0, orig - partialDed);
    }, 0)
  );

  let deliveredItems = 0;
  deliveredOrders.forEach((o: any) => {
    const items = (o.line_items as any[]) || [];
    items.forEach((i: any) => {
      const q = typeof i.quantity === "number" ? i.quantity : Number(i.quantity) || 0;
      deliveredItems += q;
    });
  });

  const deliveredAOV = deliveredCount > 0 ? Math.round(deliveredRevenue / deliveredCount) : 0;

  // Returns Calculations
  const returnedCount = filteredReturns.length;
  const fullReturnsCount = filteredReturns.filter((r: any) => r.return_type === "full").length;
  const partialReturnsCount = filteredReturns.filter((r: any) => r.return_type === "partial").length;
  const paidReturnsCount = filteredReturns.filter((r: any) => Boolean(r.is_paid_return)).length;

  const returnedValue = Math.round(
    filteredReturns.reduce((sum: number, r: any) => {
      if (r.return_type === "partial") {
        if (r.is_verified === false) return sum;
        return sum + computePartialReturnValue(r);
      }
      return sum + Number(r.returned_product_value || r.refund_amount || r.order_total || 0);
    }, 0)
  );

  const returnFees = Math.round(
    filteredReturns.reduce((sum: number, r: any) => {
      if (r.is_paid_return) return sum;
      return sum + (Number(r.return_delivery_fee) || 0);
    }, 0)
  );

  const pendingReturnsCount = filteredReturns.filter((r: any) =>
    ["in_transit", "received", "pending_verification"].includes(r.status)
  ).length;

  const processedReturnsCount = filteredReturns.filter((r: any) =>
    ["inspected", "restocked", "damaged"].includes(r.status)
  ).length;

  const needsAttentionCount = filteredReturns.filter(
    (r: any) =>
      r.status === "pending_verification" ||
      (r.return_type === "partial" && r.is_verified === false)
  ).length;

  // Courier Reconciliation Calculations
  let courierDeliveredCount = 0;
  let courierDeliveredValue = 0;
  let courierDeliveredFee = 0;
  let courierPaidReturnCount = 0;
  let courierPaidReturnValue = 0;
  let courierPaidReturnFee = 0;
  let courierReturnedCount = 0;
  let courierReturnedValue = 0;
  let courierReturnedFee = 0;
  let courierProcessingCount = 0;
  let courierProcessingValue = 0;
  let courierPickupIssueCount = 0;
  let courierPickupIssueValue = 0;
  let courierActiveTotalCount = 0;
  let courierActiveTotalValue = 0;
  let courierTotalCount = 0;
  let courierTotalValue = 0;
  let courierSettledAmount = 0;

  filteredDispatches.forEach((d: any) => {
    const st = (d.pathao_order_status || "").toLowerCase().trim();
    const rawVal =
      d.amount_to_collect != null
        ? Number(d.amount_to_collect)
        : Number(d.orders?.original_total_price ?? d.orders?.total_price ?? 0);
    const partialDed = partialReturnsByOrderId.get(d.order_id) || 0;
    const val = Math.max(0, rawVal - partialDed);
    const defaultFee = d.recipient_city === 1 ? 60 : 120;
    const fee = Number(d.delivery_fee || defaultFee);
    const retFee = Number(d.return_charge || fee);

    const isCancelledOrFailed =
      d.is_cancelled ||
      st.includes("cancel") ||
      st.includes("pickup failed") ||
      st.includes("pickup-failed");

    if (!isCancelledOrFailed) {
      courierActiveTotalCount++;
    }

    courierTotalCount++;
    courierTotalValue += rawVal;
    courierSettledAmount += Number(d.actual_received_amount || 0);

    if (st === "delivered" || st.includes("partial")) {
      courierDeliveredCount++;
      courierDeliveredValue += val;
      courierDeliveredFee += fee;
      courierActiveTotalValue += val;
    } else if (st === "paid return" || st === "paid_return") {
      courierPaidReturnCount++;
      courierPaidReturnValue += rawVal;
      courierPaidReturnFee += fee;
      courierActiveTotalValue += fee;
    } else if (st.includes("return") || st.includes("delivery_failed") || st.includes("delivery failed")) {
      courierReturnedCount++;
      courierReturnedValue += rawVal;
      courierReturnedFee += retFee;
    } else if (isCancelledOrFailed) {
      courierPickupIssueCount++;
      courierPickupIssueValue += rawVal;
    } else {
      courierProcessingCount++;
      courierProcessingValue += rawVal;
    }
  });

  courierActiveTotalValue = Math.round(courierActiveTotalValue);

  const activeDispatches = filteredDispatches.filter((d: any) => {
    const st = (d.pathao_order_status || "").toLowerCase();
    if (st === "delivered" || st.includes("partial") || st.includes("return")) return true;
    if (d.is_cancelled) return false;
    if (st.includes("pickup cancel")) return false;
    return true;
  });
  const dispatchedCount = activeDispatches.length;
  const amountToCollect = Math.round(
    activeDispatches.reduce((sum: number, d: any) => sum + (Number(d.amount_to_collect) || 0), 0)
  );

  // Overall counts & Return Rate Formulas
  const totalOrders = filteredOrders.length;
  const nonCancelledOrders = filteredOrders.filter((o: any) => o.internal_status !== "cancelled");
  const grossOrderValue = Math.round(
    nonCancelledOrders.reduce((sum: number, o: any) => sum + getOrigOrderPrice(o), 0)
  );
  const pendingOrdersCount = filteredOrders.filter((o: any) => o.internal_status === "pending").length;
  const cancelledOrdersCount = filteredOrders.filter((o: any) => o.internal_status === "cancelled").length;

  const eligibleDispatchedOrders = nonCancelledOrders.filter((o: any) =>
    ["dispatched", "delivered", "returned", "delayed"].includes(o.internal_status) ||
    Boolean(o.pathao_consignment_id)
  );
  const finalizedEligibleOrders = nonCancelledOrders.filter((o: any) =>
    ["delivered", "returned"].includes(o.internal_status)
  );
  const ordersWithReturnCount = nonCancelledOrders.filter(
    (o: any) => o.internal_status === "returned" || (partialReturnsByOrderId.get(o.id) || 0) > 0
  ).length;

  const orderReturnRate =
    eligibleDispatchedOrders.length > 0
      ? Number(((ordersWithReturnCount / eligibleDispatchedOrders.length) * 100).toFixed(2))
      : 0;
  const finalizedOrderReturnRate =
    finalizedEligibleOrders.length > 0
      ? Number(((ordersWithReturnCount / finalizedEligibleOrders.length) * 100).toFixed(2))
      : 0;
  const eligibleDispatchedValue = eligibleDispatchedOrders.reduce(
    (sum: number, o: any) => sum + getOrigOrderPrice(o),
    0
  );
  const returnedValuePercentage =
    eligibleDispatchedValue > 0
      ? Number(((returnedValue / eligibleDispatchedValue) * 100).toFixed(2))
      : 0;

  // Expenses & Settlements from transactions
  let recordedExpenses = 0;
  let settlementTxIncome = 0;
  for (const t of allTransactions) {
    const amt = Number(t.amount || 0);
    const cat = (t.category || "").toLowerCase();
    if (t.type === "expense") {
      if (!t.is_courier_charge && cat !== "courier charges" && cat !== "courier/delivery") {
        recordedExpenses += amt;
      }
    } else if (t.type === "income") {
      if (cat.includes("pathao") || cat.includes("steadfast") || cat.includes("cod settlement")) {
        settlementTxIncome += amt;
      }
    }
  }

  const courierTotalCharges = Math.round(courierDeliveredFee + courierPaidReturnFee + Math.max(courierReturnedFee, returnFees));
  const courierNetPayable = Math.max(0, Math.round(courierDeliveredValue - courierTotalCharges));
  const effectiveSettled = Math.max(courierSettledAmount, settlementTxIncome);
  const courierOutstandingBalance = Math.max(0, courierNetPayable - effectiveSettled);

  const effectiveDeliveredRevenue = courierDeliveredValue || deliveredRevenue;
  const netRevenue = Math.max(0, effectiveDeliveredRevenue - Math.max(courierReturnedFee, returnFees));
  const operatingResult = Math.round(effectiveDeliveredRevenue - courierTotalCharges - recordedExpenses);

  return {
    deliveredCount: courierDeliveredCount || deliveredCount,
    deliveredRevenue: effectiveDeliveredRevenue,
    deliveredItems,
    deliveredAOV,
    returnedCount,
    returnedValue,
    returnFees: Math.max(returnFees, courierReturnedFee),
    pendingReturnsCount,
    processedReturnsCount,
    needsAttentionCount,
    fullReturnsCount,
    partialReturnsCount,
    paidReturnsCount,
    orderReturnRate,
    returnedValuePercentage,
    finalizedOrderReturnRate,
    dispatchedCount,
    amountToCollect,
    courierDeliveredCount,
    courierDeliveredValue,
    courierDeliveredFee: Math.round(courierDeliveredFee),
    courierPaidReturnCount,
    courierPaidReturnValue,
    courierPaidReturnFee: Math.round(courierPaidReturnFee),
    courierReturnedCount,
    courierReturnedValue,
    courierReturnedFee: Math.round(courierReturnedFee),
    courierProcessingCount,
    courierProcessingValue,
    courierPickupIssueCount,
    courierPickupIssueValue,
    courierActiveTotalCount,
    courierActiveTotalValue,
    courierTotalCount,
    courierTotalValue,
    courierTotalCharges,
    courierNetPayable,
    courierSettledAmount: Math.round(effectiveSettled),
    courierOutstandingBalance: Math.round(courierOutstandingBalance),
    totalOrders,
    grossOrderValue,
    pendingOrdersCount,
    cancelledOrdersCount,
    netRevenue,
    recordedExpenses: Math.round(recordedExpenses),
    operatingResult,
    dateFilter,
    startDateStr,
    endDateStr,
  };
}

export interface ReturnsPageMetrics {
  returnedCount: number;
  returnedValue: number;
  returnFees: number;
  pendingReturnsCount: number;
  processedReturnsCount: number;
  needsAttentionCount: number;
  fullReturnsCount?: number;
  partialReturnsCount?: number;
  paidReturnsCount?: number;
}

export async function getReturnsPageMetrics(search?: string): Promise<ReturnsPageMetrics> {
  const supabase = createServiceClient();
  let q = supabase
    .from("returns")
    .select(
      "order_total, refund_amount, returned_product_value, return_type, returned_items, return_delivery_fee, status, is_verified, is_paid_return, orders!inner(shopify_order_name, customer_name, customer_phone)"
    );

  if (search) {
    const s = search.trim();
    q = q.or(
      `consignment_id.ilike.%${s}%,return_reason.ilike.%${s}%,orders.shopify_order_name.ilike.%${s}%,orders.customer_name.ilike.%${s}%,orders.customer_phone.ilike.%${s}%`
    );
  }

  const { data: returnsData } = await q;
  const list = returnsData || [];

  const returnedCount = list.length;
  let returnedValue = 0;
  let returnFees = 0;
  let pendingReturnsCount = 0;
  let processedReturnsCount = 0;
  let needsAttentionCount = 0;
  let fullReturnsCount = 0;
  let partialReturnsCount = 0;
  let paidReturnsCount = 0;

  for (const r of list as any[]) {
    if (r.is_paid_return) paidReturnsCount++;
    if (r.return_type === "partial") {
      partialReturnsCount++;
      if (r.is_verified !== false) {
        returnedValue += computePartialReturnValue(r);
      }
    } else {
      fullReturnsCount++;
      returnedValue += Number(r.returned_product_value || r.refund_amount || r.order_total) || 0;
    }

    if (!r.is_paid_return) {
      returnFees += Number(r.return_delivery_fee) || 0;
    }

    if (["in_transit", "received", "pending_verification"].includes(r.status)) {
      pendingReturnsCount++;
    }
    if (["inspected", "restocked", "damaged"].includes(r.status)) {
      processedReturnsCount++;
    }
    if (r.status === "pending_verification" || (r.return_type === "partial" && r.is_verified === false)) {
      needsAttentionCount++;
    }
  }

  return {
    returnedCount,
    returnedValue: Math.round(returnedValue),
    returnFees: Math.round(returnFees),
    pendingReturnsCount,
    processedReturnsCount,
    needsAttentionCount,
    fullReturnsCount,
    partialReturnsCount,
    paidReturnsCount,
  };
}
