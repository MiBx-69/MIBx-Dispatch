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

  // Dispatches
  dispatchedCount: number;
  amountToCollect: number;

  // Courier Reconciliation (Pathao Live Hermes Data)
  courierDeliveredCount: number;
  courierDeliveredValue: number;
  courierPaidReturnCount: number;
  courierPaidReturnValue: number;
  courierPaidReturnFee: number;
  courierReturnedCount: number;
  courierReturnedValue: number;
  courierProcessingCount: number;
  courierProcessingValue: number;
  courierPickupIssueCount: number;
  courierPickupIssueValue: number;
  courierActiveTotalCount: number;
  courierActiveTotalValue: number;
  courierTotalCount: number;
  courierTotalValue: number;

  // Overall
  totalOrders: number;
  pendingOrdersCount: number;
  cancelledOrdersCount: number;
  netRevenue: number;

  // Range metadata
  dateFilter: string;
  startDateStr: string | null;
  endDateStr: string | null;
}

export async function getUnifiedReportMetrics(params: {
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}): Promise<UnifiedReportMetrics> {
  const supabase = createServiceClient();
  const dateFilter = params.dateFilter || "all";
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
  const ordersQuery = supabase
    .from("orders")
    .select("id, shopify_order_name, customer_name, customer_phone, pathao_consignment_id, total_price, internal_status, line_items, shopify_created_at, delivered_at, returned_at")
    .eq("is_archived", false);

  // 2. Fetch Dispatches (all consignments with optional order info)
  const dispatchesQuery = supabase
    .from("dispatches")
    .select("id, order_id, shopify_order_name, recipient_name, recipient_phone, consignment_id, amount_to_collect, delivery_fee, is_cancelled, pathao_order_status, dispatched_at, orders(id, internal_status, is_archived, total_price)")
    .not("consignment_id", "is", null);

  // 3. Fetch Returns
  const returnsQuery = supabase
    .from("returns")
    .select("id, order_id, consignment_id, order_total, refund_amount, return_type, returned_items, return_delivery_fee, status, is_verified, returned_at, orders!inner(shopify_order_name, customer_name, customer_phone, shopify_created_at)");

  const [
    { data: ordersData },
    { data: dispatchesData },
    { data: returnsData },
  ] = await Promise.all([
    ordersQuery,
    dispatchesQuery,
    returnsQuery,
  ]);

  let allOrders: any[] = ordersData || [];
  let allDispatches: any[] = (dispatchesData || []).filter((d: any) => {
    if (d.orders?.is_archived) return false;
    return true;
  });
  let allReturns: any[] = returnsData || [];

  // Search filtering
  if (params.search) {
    const s = params.search.toLowerCase();
    allOrders = allOrders.filter((o: any) => 
      (o.shopify_order_name && o.shopify_order_name.toLowerCase().includes(s)) ||
      (o.customer_name && o.customer_name.toLowerCase().includes(s)) ||
      (o.customer_phone && o.customer_phone.toLowerCase().includes(s)) ||
      (o.pathao_consignment_id && o.pathao_consignment_id.toLowerCase().includes(s))
    );
    allDispatches = allDispatches.filter((d: any) =>
      (d.shopify_order_name && d.shopify_order_name.toLowerCase().includes(s)) ||
      (d.recipient_name && d.recipient_name.toLowerCase().includes(s)) ||
      (d.recipient_phone && d.recipient_phone.toLowerCase().includes(s)) ||
      (d.consignment_id && d.consignment_id.toLowerCase().includes(s))
    );
    allReturns = allReturns.filter((r: any) =>
      (r.consignment_id && r.consignment_id.toLowerCase().includes(s)) ||
      (r.orders?.shopify_order_name && r.orders.shopify_order_name.toLowerCase().includes(s)) ||
      (r.orders?.customer_name && r.orders.customer_name.toLowerCase().includes(s)) ||
      (r.orders?.customer_phone && r.orders.customer_phone.toLowerCase().includes(s))
    );
  }

  // Date range filtering
  const filteredOrders = allOrders.filter((o: any) => isInDateRange(o.shopify_created_at || o.delivered_at));
  const filteredDispatches = allDispatches.filter((d: any) => isInDateRange(d.dispatched_at));
  const filteredReturns = allReturns.filter((r: any) => isInDateRange(r.returned_at || r.orders?.shopify_created_at));

  // Delivered Calculations
  const deliveredOrders = filteredOrders.filter((o: any) => o.internal_status === "delivered");
  const deliveredCount = deliveredOrders.length;
  const deliveredRevenue = Math.round(
    deliveredOrders.reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0)
  );

  let deliveredItems = 0;
  deliveredOrders.forEach((o: any) => {
    const items = (o.line_items as any[]) || [];
    items.forEach((i: any) => {
      const q = typeof i.quantity === "number" ? i.quantity : (Number(i.quantity) || 0);
      deliveredItems += q;
    });
  });

  const deliveredAOV = deliveredCount > 0 ? Math.round(deliveredRevenue / deliveredCount) : 0;

  // Returns Calculations
  const returnedCount = filteredReturns.length;
  const returnedValue = Math.round(
    filteredReturns.reduce((sum: number, r: any) => {
      if (r.return_type === "partial") {
        if (Number(r.refund_amount) > 0) return sum + Number(r.refund_amount);
        if (Array.isArray(r.returned_items) && r.returned_items.length > 0) {
          const itemsSum = r.returned_items.reduce((s: number, i: any) => s + (Number(i.price || 0) * Number(i.quantity || 1)), 0);
          if (itemsSum > 0) return sum + itemsSum;
        }
      }
      return sum + (Number(r.order_total) || 0);
    }, 0)
  );

  const returnFees = Math.round(
    filteredReturns.reduce((sum: number, r: any) => sum + (Number(r.return_delivery_fee) || 0), 0)
  );

  const pendingReturnsCount = filteredReturns.filter((r: any) => 
    ["in_transit", "received", "pending_verification"].includes(r.status)
  ).length;

  const processedReturnsCount = filteredReturns.filter((r: any) => 
    ["inspected", "restocked", "damaged"].includes(r.status)
  ).length;

  const needsAttentionCount = filteredReturns.filter((r: any) => 
    r.status === "pending_verification" || (r.return_type === "partial" && r.is_verified === false)
  ).length;

  // Courier Reconciliation Calculations (matching Pathao Hermes metrics 1:1)
  let courierDeliveredCount = 0;
  let courierDeliveredValue = 0;
  let courierPaidReturnCount = 0;
  let courierPaidReturnValue = 0;
  let courierPaidReturnFee = 0;
  let courierReturnedCount = 0;
  let courierReturnedValue = 0;
  let courierProcessingCount = 0;
  let courierProcessingValue = 0;
  let courierPickupIssueCount = 0;
  let courierPickupIssueValue = 0;
  let courierTotalCount = 0;
  let courierTotalValue = 0;

  filteredDispatches.forEach((d: any) => {
    const st = (d.pathao_order_status || "").toLowerCase().trim();
    const val = Number(d.amount_to_collect || d.orders?.total_price || 0);
    const fee = Number(d.delivery_fee || 110);

    courierTotalCount++;
    courierTotalValue += val;

    if (st === "delivered" || st.includes("partial")) {
      courierDeliveredCount++;
      courierDeliveredValue += val;
    } else if (st === "paid return") {
      courierPaidReturnCount++;
      courierPaidReturnValue += val;
      courierPaidReturnFee += fee;
    } else if (st.includes("return")) {
      courierReturnedCount++;
      courierReturnedValue += val;
    } else if (st.includes("pickup")) {
      courierPickupIssueCount++;
      courierPickupIssueValue += val;
    } else {
      courierProcessingCount++;
      courierProcessingValue += val;
    }
  });

  const courierActiveTotalCount = courierDeliveredCount + courierPaidReturnCount + courierReturnedCount + courierProcessingCount;
  const courierActiveTotalValue = Math.round(courierDeliveredValue + courierPaidReturnFee + courierReturnedValue + courierProcessingValue);

  // Dispatches Calculations (active, non-pickup-cancelled)
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

  // Overall counts
  const totalOrders = filteredOrders.length;
  const pendingOrdersCount = filteredOrders.filter((o: any) => o.internal_status === "pending").length;
  const cancelledOrdersCount = filteredOrders.filter((o: any) => o.internal_status === "cancelled").length;
  const netRevenue = Math.max(0, (courierDeliveredValue || deliveredRevenue) - returnFees);

  return {
    deliveredCount: courierDeliveredCount || deliveredCount,
    deliveredRevenue: courierDeliveredValue || deliveredRevenue,
    deliveredItems,
    deliveredAOV,
    returnedCount,
    returnedValue,
    returnFees,
    pendingReturnsCount,
    processedReturnsCount,
    needsAttentionCount,
    dispatchedCount,
    amountToCollect,
    courierDeliveredCount,
    courierDeliveredValue,
    courierPaidReturnCount,
    courierPaidReturnValue,
    courierPaidReturnFee,
    courierReturnedCount,
    courierReturnedValue,
    courierProcessingCount,
    courierProcessingValue,
    courierPickupIssueCount,
    courierPickupIssueValue,
    courierActiveTotalCount,
    courierActiveTotalValue,
    courierTotalCount,
    courierTotalValue,
    totalOrders,
    pendingOrdersCount,
    cancelledOrdersCount,
    netRevenue,
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
}

/**
 * Lightweight, fast metrics query specifically for the Returns dashboard page.
 * Queries ONLY the returns table instead of loading all orders and dispatches.
 */
export async function getReturnsPageMetrics(search?: string): Promise<ReturnsPageMetrics> {
  const supabase = createServiceClient();
  let q = supabase
    .from("returns")
    .select("order_total, refund_amount, return_type, returned_items, return_delivery_fee, status, is_verified, orders!inner(shopify_order_name, customer_name, customer_phone)");

  if (search) {
    const s = search.trim();
    q = q.or(`consignment_id.ilike.%${s}%,return_reason.ilike.%${s}%,orders.shopify_order_name.ilike.%${s}%,orders.customer_name.ilike.%${s}%,orders.customer_phone.ilike.%${s}%`);
  }

  const { data: returnsData } = await q;
  const list = returnsData || [];

  const returnedCount = list.length;
  let returnedValue = 0;
  let returnFees = 0;
  let pendingReturnsCount = 0;
  let processedReturnsCount = 0;
  let needsAttentionCount = 0;

  for (const r of list as any[]) {
    if (r.return_type === "partial") {
      if (Number(r.refund_amount) > 0) {
        returnedValue += Number(r.refund_amount);
      } else if (Array.isArray(r.returned_items) && r.returned_items.length > 0) {
        const itemsSum = r.returned_items.reduce((s: number, i: any) => s + (Number(i.price || 0) * Number(i.quantity || 1)), 0);
        if (itemsSum > 0) returnedValue += itemsSum;
      }
    } else {
      returnedValue += Number(r.order_total) || 0;
    }

    returnFees += Number(r.return_delivery_fee) || 0;

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
  };
}
