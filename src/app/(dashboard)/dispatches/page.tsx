import { createServiceClient } from "@/lib/supabase/server";
import { DispatchesClient } from "./dispatches-client";
import { Metadata } from "next";
import { getUnifiedReportMetrics, resolveDateRange } from "@/lib/reporting-engine";

export const metadata: Metadata = { title: "Dispatches" };
export const dynamic = "force-dynamic";

export default async function DispatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; dateFilter?: string; startDate?: string; endDate?: string; search?: string; }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();
  const page = parseInt(params.page || "1");
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  const dateFilter = params.dateFilter || "all";

  let query = supabase
    .from("dispatches")
    .select("*, orders!inner(*, returns(id, return_type, status))", { count: "exact" })
    .order("dispatched_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  const STATUS_MAP: Record<string, string[]> = {
    "Pending": ["Pending", "order.assigned_for_pickup", "order.pickup_cancelled", "order.assigned-for-pickup"],
    "Picked Up": ["Picked Up", "order.pickup_collected"],
    "In Transit": ["In Transit", "order.in_transit", "order.at_delivery_hub", "On the Way To Delivery Hub"],
    "Ready for Delivery": ["Ready for Delivery", "Assigned for Delivery", "Assigned For Delivery", "order.assigned_for_delivery", "order.assigned-for-delivery"],
    "Out for Delivery": ["Out for Delivery", "order.out_for_delivery"],
    "Delivered": ["Delivered", "order.delivered", "order.payment_received"],
    "Partial Delivered": ["Partial Delivered", "Partial Delivery", "order.partial_delivery"],
    "Return": ["Return", "order.return_in_transit"],
    "Paid Return": ["Paid Return", "order.paid-return"],
    "Return Completed": ["Return Completed", "Returned", "order.returned", "order.returned-to-merchant"],
    "Hold": ["Hold", "order.hold", "order.failed", "Pickup On Hold", "Pickup Failed", "order.pickup-failed"],
    "Cancelled": ["Cancelled", "order.cancelled"],
  };

  if (params.status === "Cancelled") {
    query = query.or("is_cancelled.eq.true,pathao_order_status.in.(Cancelled,order.cancelled),orders.internal_status.eq.cancelled");
  } else {
    query = query
      .eq("is_cancelled", false)
      .neq("orders.internal_status", "cancelled")
      .eq("orders.is_archived", false);

    if (params.status === "Hold") {
      query = query.or("pathao_order_status.in.(Hold,order.hold,order.failed,Pickup On Hold,Pickup Failed,order.pickup-failed),orders.internal_status.in.(hold,on_hold),orders.fulfillment_status.in.(on_hold,hold)");
    } else if (params.status) {
      const mapped = STATUS_MAP[params.status] || [params.status];
      query = query.in("pathao_order_status", mapped);
    }
  }

  if (params.search) {
    const s = params.search;
    query = query.or(`consignment_id.ilike.%${s}%,recipient_phone.ilike.%${s}%,shopify_order_name.ilike.%${s}%`);
  }

  const { startDateStr, endDateStr } = resolveDateRange(dateFilter, params.startDate, params.endDate);
  if (startDateStr && endDateStr) {
    query = query.gte("dispatched_at", startDateStr).lte("dispatched_at", endDateStr);
  }

  const [
    { data: rawDispatches, count },
    metrics,
    { data: settings },
    { data: lastWebhookLog },
    { count: failedWebhookCount },
    { data: lastSyncLog },
  ] = await Promise.all([
    query,
    getUnifiedReportMetrics({
      dateFilter,
      startDate: params.startDate,
      endDate: params.endDate,
      search: params.search,
    }),
    supabase.from("app_settings").select("pathao_store_id, pathao_client_id, pathao_client_secret, pathao_webhook_secret").single(),
    supabase.from("webhook_logs").select("received_at").eq("source", "pathao").order("received_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("webhook_logs").select("id", { count: "exact", head: true }).eq("source", "pathao").or("processing_status.eq.failed,shopify_sync_status.eq.failed"),
    supabase.from("sync_logs").select("completed_at, started_at").eq("sync_type", "pathao_reconciliation").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  
  // Stable pagination: preserve SQL ordering by dispatched_at DESC
  const dispatches = rawDispatches;

  const apiConfigured = Boolean(
    (process.env.PATHAO_CLIENT_ID && process.env.PATHAO_CLIENT_SECRET) ||
    (settings?.pathao_client_id && settings?.pathao_client_secret)
  );
  const webhookSecretConfigured = Boolean(
    process.env.PATHAO_WEBHOOK_SECRET || settings?.pathao_webhook_secret
  );

  const pathaoTelemetry = {
    connection: {
      apiConfigured,
      webhookSecretConfigured,
      webhookUrl: "https://orders.universesraw.com/api/webhooks/pathao",
      lastWebhookReceivedAt: lastWebhookLog?.received_at || null,
      lastReconciliationAt: lastSyncLog?.completed_at || lastSyncLog?.started_at || null,
      failedWebhookCount: failedWebhookCount || 0,
    },
    parcelOverview: {
      totalDispatched: metrics.dispatchedCount,
      pickupPending: metrics.courierPickupPendingCount ?? metrics.courierProcessingCount,
      pickedUp: metrics.courierPickedUpCount ?? 0,
      inTransit: metrics.courierInTransitCount ?? 0,
      outForDelivery: metrics.courierOutForDeliveryCount ?? 0,
      delivered: metrics.deliveredCount,
      partialDelivery: metrics.courierPartialDeliveryCount ?? 0,
      returnInTransit: metrics.courierReturnInTransitCount ?? metrics.courierReturnedCount,
      returnedToMerchant: metrics.courierReturnedToMerchantCount ?? metrics.returnedCount,
      onHoldOrFailed: metrics.courierOnHoldOrFailedCount ?? metrics.courierPickupIssueCount,
    },
  };

  const dispatchStats = {
    totalQuantity: metrics.dispatchedCount,
    totalAmount: metrics.amountToCollect,
    deliveredCount: metrics.deliveredCount,
    deliveredAmount: metrics.deliveredRevenue,
    returnedCount: metrics.returnedCount,
    returnedAmount: metrics.returnedValue,
    dateFilter,
    startDate: params.startDate,
    endDate: params.endDate,
  };

  return (
    <DispatchesClient
      dispatches={dispatches || []}
      count={count || 0}
      currentStatus={params.status}
      currentSearch={params.search}
      pathaoStoreId={settings?.pathao_store_id || undefined}
      dateFilter={dateFilter}
      startDate={params.startDate}
      endDate={params.endDate}
      totalAmount={metrics.amountToCollect}
      totalQuantity={metrics.dispatchedCount}
      stats={dispatchStats}
      telemetry={pathaoTelemetry}
      page={page}
      pageSize={pageSize}
    />
  );
}
