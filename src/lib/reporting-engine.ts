import { createServiceClient } from "@/lib/supabase/server";

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

  // Dispatches
  dispatchedCount: number;
  amountToCollect: number;

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

export function resolveDateRange(dateFilter?: string, customStart?: string, customEnd?: string) {
  if (!dateFilter || dateFilter === "all") {
    return { startDateStr: null, endDateStr: null };
  }

  const now = new Date();
  let start: Date;
  let end: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (dateFilter === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  } else if (dateFilter === "yesterday") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
  } else if (dateFilter === "last_7_days") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0);
  } else if (dateFilter === "last_30_days") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 0, 0, 0, 0);
  } else if (dateFilter === "this_month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (dateFilter === "last_month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  } else if (dateFilter === "custom" && customStart && customEnd) {
    start = new Date(customStart);
    start.setHours(0, 0, 0, 0);
    end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
  } else {
    return { startDateStr: null, endDateStr: null };
  }

  return {
    startDateStr: start.toISOString(),
    endDateStr: end.toISOString(),
  };
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

  // 1. Fetch Orders
  const ordersQuery = supabase
    .from("orders")
    .select("id, shopify_order_name, customer_name, customer_phone, pathao_consignment_id, total_price, internal_status, line_items, shopify_created_at, delivered_at, returned_at")
    .eq("is_archived", false);

  // 2. Fetch Dispatches (non-cancelled)
  const dispatchesQuery = supabase
    .from("dispatches")
    .select("id, order_id, shopify_order_name, recipient_name, recipient_phone, consignment_id, amount_to_collect, is_cancelled, dispatched_at, orders!inner(internal_status)")
    .neq("orders.internal_status", "cancelled");

  // 3. Fetch Returns
  const returnsQuery = supabase
    .from("returns")
    .select("id, order_id, consignment_id, order_total, refund_amount, return_type, returned_items, return_delivery_fee, status, returned_at, orders!inner(shopify_order_name, customer_name, customer_phone, shopify_created_at)");

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
  let allDispatches: any[] = dispatchesData || [];
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

  // Dispatches Calculations
  const dispatchedCount = filteredDispatches.length;
  const amountToCollect = Math.round(
    filteredDispatches.reduce((sum: number, d: any) => sum + (Number(d.amount_to_collect) || 0), 0)
  );

  // Overall counts
  const totalOrders = filteredOrders.length;
  const pendingOrdersCount = filteredOrders.filter((o: any) => o.internal_status === "pending").length;
  const cancelledOrdersCount = filteredOrders.filter((o: any) => o.internal_status === "cancelled").length;
  const netRevenue = Math.max(0, deliveredRevenue - returnFees);

  return {
    deliveredCount,
    deliveredRevenue,
    deliveredItems,
    deliveredAOV,
    returnedCount,
    returnedValue,
    returnFees,
    pendingReturnsCount,
    processedReturnsCount,
    dispatchedCount,
    amountToCollect,
    totalOrders,
    pendingOrdersCount,
    cancelledOrdersCount,
    netRevenue,
    dateFilter,
    startDateStr,
    endDateStr,
  };
}
