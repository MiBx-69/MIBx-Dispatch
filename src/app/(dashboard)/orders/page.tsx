import { createServiceClient } from "@/lib/supabase/server";
import { OrdersClient } from "./orders-client";
import type { Metadata } from "next";
import { getUnifiedReportMetrics, resolveDateRange } from "@/lib/reporting-engine";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    search?: string;
    page?: string;
    dateFilter?: string;
    startDate?: string;
    endDate?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();

  const page = parseInt(params.page || "1");
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("orders")
    .select("*, returns(id, status, return_type, is_verified, refund_amount)", { count: "exact" })
    .order("shopify_created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  // Date filtering calculation for delivered orders
  const dateFilter = params.dateFilter || "all";
  const { startDateStr, endDateStr } = resolveDateRange(dateFilter, params.startDate, params.endDate);

  if (params.status === "archived") {
    query = query.eq("is_archived", true);
  } else if (params.status === "everything") {
    query = query.eq("is_archived", false);
  } else if (params.status === "in_progress" || params.status === "preparing") {
    query = query
      .eq("is_archived", false)
      .or("internal_status.in.(preparing,in_progress),fulfillment_status.in.(in_progress,partial)")
      .neq("internal_status", "dispatched")
      .neq("internal_status", "cancelled")
      .is("cancel_reason", null)
      .neq("financial_status", "voided")
      .is("pathao_consignment_id", null);
  } else if (params.status === "on_hold" || params.status === "hold") {
    query = query
      .eq("is_archived", false)
      .or("internal_status.in.(hold,on_hold),fulfillment_status.in.(on_hold,hold)")
      .neq("internal_status", "cancelled")
      .is("cancel_reason", null)
      .neq("financial_status", "voided");
  } else if (params.status === "dispatched") {
    query = query
      .eq("is_archived", false)
      .neq("internal_status", "cancelled")
      .is("cancel_reason", null)
      .neq("financial_status", "voided")
      .or("internal_status.eq.dispatched,pathao_consignment_id.not.is.null");
  } else if (params.status === "delivered") {
    query = query.eq("is_archived", false).eq("internal_status", "delivered");
    if (startDateStr && endDateStr) {
      query = query.gte("shopify_created_at", startDateStr).lte("shopify_created_at", endDateStr);
    }
  } else if (params.status === "partial_delivery") {
    query = query.eq("is_archived", false).ilike("pathao_delivery_status", "%partial%");
    if (startDateStr && endDateStr) {
      query = query.gte("shopify_created_at", startDateStr).lte("shopify_created_at", endDateStr);
    }
  } else if (params.status === "cancelled") {
    query = query
      .eq("is_archived", false)
      .or("internal_status.eq.cancelled,cancel_reason.not.is.null,financial_status.eq.voided");
  } else if (!params.status || params.status === "all" || params.status === "pending" || params.status === "unfulfilled") {
    query = query
      .eq("is_archived", false)
      .neq("internal_status", "dispatched")
      .neq("internal_status", "cancelled")
      .is("cancel_reason", null)
      .neq("financial_status", "voided")
      .is("pathao_consignment_id", null);
  } else {
    query = query.eq("is_archived", false).eq("internal_status", params.status);
  }

  if (params.search) {
    query = query.or(
      `customer_name.ilike.%${params.search}%,customer_phone.ilike.%${params.search}%,shopify_order_name.ilike.%${params.search}%,pathao_consignment_id.ilike.%${params.search}%`
    );
  }

  // If status is delivered, calculate full reporting metrics using the unified engine
  let deliveredStats: any = null;
  if (params.status === "delivered") {
    const metrics = await getUnifiedReportMetrics({
      dateFilter,
      startDate: params.startDate,
      endDate: params.endDate,
      search: params.search,
    });

    deliveredStats = {
      totalDeliveredCount: metrics.deliveredCount,
      totalDeliveredAmount: metrics.deliveredRevenue,
      deliveredAOV: metrics.deliveredAOV,
      totalDeliveredItems: metrics.deliveredItems,
      dateFilter,
      startDate: params.startDate,
      endDate: params.endDate,
    };
  }

  // Run main order query, all filter count queries, and settings concurrently
  const [
    { data: orders, count },
    { count: preparingCount },
    { count: dispatchedCount },
    { count: onHoldCount },
    { count: cancelledCount },
    { count: partialDeliveryCount },
    { data: settings },
  ] = await Promise.all([
    query,
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("is_archived", false)
      .or("internal_status.in.(preparing,in_progress),fulfillment_status.in.(in_progress,partial)")
      .neq("internal_status", "dispatched")
      .neq("internal_status", "cancelled")
      .is("cancel_reason", null)
      .neq("financial_status", "voided")
      .is("pathao_consignment_id", null),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("is_archived", false)
      .neq("internal_status", "cancelled")
      .is("cancel_reason", null)
      .neq("financial_status", "voided")
      .or("internal_status.eq.dispatched,pathao_consignment_id.not.is.null"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("is_archived", false)
      .or("internal_status.in.(hold,on_hold),fulfillment_status.in.(on_hold,hold)")
      .neq("internal_status", "cancelled")
      .is("cancel_reason", null)
      .neq("financial_status", "voided"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("is_archived", false)
      .or("internal_status.eq.cancelled,cancel_reason.not.is.null,financial_status.eq.voided"),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("is_archived", false)
      .ilike("pathao_delivery_status", "%partial%"),
    supabase.from("app_settings").select("pathao_store_id").single(),
  ]);

  return (
    <OrdersClient
      orders={orders || []}
      total={count || 0}
      inProgressCount={preparingCount || 0}
      preparingCount={preparingCount || 0}
      dispatchedCount={dispatchedCount || 0}
      onHoldCount={onHoldCount || 0}
      cancelledCount={cancelledCount || 0}
      partialDeliveryCount={partialDeliveryCount || 0}
      page={page}
      pageSize={pageSize}
      currentStatus={params.status}
      currentSearch={params.search}
      pathaoStoreId={settings?.pathao_store_id}
      deliveredStats={deliveredStats}
    />
  );
}
