import { createServiceClient } from "@/lib/supabase/server";
import { resolveDateRange } from "./reporting-engine";

export interface UnifiedLogEntry {
  id: string;
  source: "shopify" | "pathao" | "sms" | "order" | "sync" | "system";
  topic: string;
  reference: string | null;
  orderId?: string | null;
  status: "success" | "error" | "pending";
  summary: string;
  payload: any;
  error: string | null;
  timestamp: string;
}

export interface LogQueryParams {
  source?: string; // "all" | "shopify" | "pathao" | "sms" | "order" | "sync" | "error"
  status?: string; // "all" | "success" | "error"
  search?: string;
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

export interface LogAnalyticsStats {
  totalLogs: number;
  successCount: number;
  errorCount: number;
  successRate: number;
  shopifyCount: number;
  pathaoCount: number;
  smsCount: number;
  orderAuditCount: number;
  syncCount: number;
  recentErrors: UnifiedLogEntry[];
}

/**
 * Normalizes a webhook_logs row into a UnifiedLogEntry
 */
function normalizeWebhookLog(row: any): UnifiedLogEntry {
  let reference = null;
  if (row.shopify_order_id) {
    const orderName = row.payload?.name || (row.payload?.order_number ? `#${row.payload.order_number}` : null);
    reference = orderName || String(row.shopify_order_id);
  } else if (row.pathao_consignment_id) {
    reference = row.pathao_consignment_id;
  } else if (row.payload?.to) {
    reference = String(row.payload.to);
  } else if (row.payload?.idempotencyKey) {
    reference = String(row.payload.idempotencyKey);
  }

  let status: "success" | "error" | "pending" = "success";
  if (row.error) {
    status = "error";
  } else if (row.processed === false) {
    status = "pending";
  }

  let summary = `${row.source.toUpperCase()} - ${row.topic}`;
  if (row.source === "sms") {
    if (row.topic === "sms/sent") summary = `SMS sent to ${row.payload?.to || "customer"}`;
    else if (row.topic === "sms/duplicate_blocked") summary = `Duplicate SMS prevented for ${row.payload?.idempotencyKey || ""}`;
    else if (row.topic === "sms/failed") summary = `SMS failed: ${row.error || "Unknown"}`;
  } else if (row.source === "shopify") {
    summary = `Shopify ${row.topic}${reference ? ` (${reference})` : ""}`;
  } else if (row.source === "pathao") {
    summary = `Pathao ${row.topic}${reference ? ` (${reference})` : ""}`;
  }

  return {
    id: row.id,
    source: row.source,
    topic: row.topic,
    reference,
    orderId: row.shopify_order_id ? String(row.shopify_order_id) : null,
    status,
    summary,
    payload: row.payload,
    error: row.error,
    timestamp: row.received_at,
  };
}

/**
 * Normalizes an order_events row into a UnifiedLogEntry
 */
function normalizeOrderEvent(row: any): UnifiedLogEntry {
  const orderNumber = row.orders?.shopify_order_name || (row.orders?.shopify_order_number ? `#${row.orders.shopify_order_number}` : null);
  return {
    id: row.id,
    source: "order",
    topic: row.event_type || "ORDER_EVENT",
    reference: orderNumber || row.order_id,
    orderId: row.order_id,
    status: "success",
    summary: row.description || `Order Event: ${row.event_type}`,
    payload: {
      ...row.metadata,
      order: row.orders ? {
        order_number: row.orders.shopify_order_number,
        customer_name: row.orders.customer_name,
        total_price: row.orders.total_price,
        internal_status: row.orders.internal_status,
      } : null,
    },
    error: null,
    timestamp: row.created_at,
  };
}

/**
 * Normalizes a sync_logs row into a UnifiedLogEntry
 */
function normalizeSyncLog(row: any): UnifiedLogEntry {
  const isErr = row.status === "failed" || (row.errors && row.errors > 0);
  return {
    id: row.id,
    source: "sync",
    topic: row.sync_type || "shopify_sync",
    reference: `${row.orders_synced || 0} orders`,
    status: isErr ? "error" : row.status === "running" ? "pending" : "success",
    summary: `Shopify Sync (${row.sync_type}): ${row.orders_synced || 0} orders, ${row.errors || 0} errors`,
    payload: {
      sync_type: row.sync_type,
      status: row.status,
      orders_synced: row.orders_synced,
      customers_synced: row.customers_synced,
      errors: row.errors,
      error_details: row.error_details,
      started_at: row.started_at,
      completed_at: row.completed_at,
    },
    error: row.error_details ? JSON.stringify(row.error_details) : null,
    timestamp: row.started_at,
  };
}

/**
 * Fetches unified logs with search, filtering, and pagination
 */
export async function getUnifiedLogs(params: LogQueryParams): Promise<{
  logs: UnifiedLogEntry[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const supabase = createServiceClient();
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(10, Number(params.pageSize) || 50));
  const dateFilter = params.dateFilter || "all";
  const { startDateStr, endDateStr } = resolveDateRange(dateFilter, params.startDate, params.endDate);

  const selectedSource = params.source || "all";
  const selectedStatus = params.status || "all";
  const search = params.search?.trim().toLowerCase();

  const fetchWebhookLogs = ["all", "shopify", "pathao", "sms", "error"].includes(selectedSource);
  const fetchOrderEvents = ["all", "order"].includes(selectedSource) && selectedStatus !== "error";
  const fetchSyncLogs = ["all", "sync", "error"].includes(selectedSource);

  const promises: Promise<any>[] = [];

  // 1. Query webhook_logs
  if (fetchWebhookLogs) {
    let q = supabase
      .from("webhook_logs")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(500);

    if (startDateStr && endDateStr) {
      q = q.gte("received_at", startDateStr).lte("received_at", endDateStr);
    }

    if (selectedSource === "shopify") {
      q = q.eq("source", "shopify");
    } else if (selectedSource === "pathao") {
      q = q.eq("source", "pathao");
    } else if (selectedSource === "sms") {
      q = q.eq("source", "sms");
    }

    if (selectedStatus === "error" || selectedSource === "error") {
      q = q.not("error", "is", null);
    } else if (selectedStatus === "success") {
      q = q.is("error", null);
    }

    promises.push(q);
  } else {
    promises.push(Promise.resolve({ data: [] }));
  }

  // 2. Query order_events
  if (fetchOrderEvents) {
    let q = supabase
      .from("order_events")
      .select("*, orders(shopify_order_name, shopify_order_number, customer_name, total_price, internal_status)")
      .order("created_at", { ascending: false })
      .limit(300);

    if (startDateStr && endDateStr) {
      q = q.gte("created_at", startDateStr).lte("created_at", endDateStr);
    }

    promises.push(q);
  } else {
    promises.push(Promise.resolve({ data: [] }));
  }

  // 3. Query sync_logs
  if (fetchSyncLogs) {
    let q = supabase
      .from("sync_logs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(100);

    if (startDateStr && endDateStr) {
      q = q.gte("started_at", startDateStr).lte("started_at", endDateStr);
    }

    if (selectedStatus === "error" || selectedSource === "error") {
      q = q.or("status.eq.failed,errors.gt.0");
    }

    promises.push(q);
  } else {
    promises.push(Promise.resolve({ data: [] }));
  }

  const [webhookRes, orderEventsRes, syncRes] = await Promise.all(promises);

  let combinedLogs: UnifiedLogEntry[] = [
    ...(webhookRes.data || []).map(normalizeWebhookLog),
    ...(orderEventsRes.data || []).map(normalizeOrderEvent),
    ...(syncRes.data || []).map(normalizeSyncLog),
  ];

  // Search filtering in memory across normalized entries
  if (search) {
    combinedLogs = combinedLogs.filter((l) => {
      const matchTopic = l.topic?.toLowerCase().includes(search);
      const matchRef = l.reference?.toLowerCase().includes(search);
      const matchSummary = l.summary?.toLowerCase().includes(search);
      const matchError = l.error?.toLowerCase().includes(search);
      const matchPayload = JSON.stringify(l.payload || "").toLowerCase().includes(search);
      return matchTopic || matchRef || matchSummary || matchError || matchPayload;
    });
  }

  // Sort chronologically descending
  combinedLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const totalCount = combinedLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const offset = (page - 1) * pageSize;
  const paginatedLogs = combinedLogs.slice(offset, offset + pageSize);

  return {
    logs: paginatedLogs,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Computes high-level analytics for log monitoring dashboard
 */
export async function getLogAnalytics(params: {
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
}): Promise<LogAnalyticsStats> {
  const supabase = createServiceClient();
  const dateFilter = params.dateFilter || "all";
  const { startDateStr, endDateStr } = resolveDateRange(dateFilter, params.startDate, params.endDate);

  // Queries for stats
  let wQuery = supabase.from("webhook_logs").select("id, source, error, received_at");
  let oQuery = supabase.from("order_events").select("id, created_at");
  let sQuery = supabase.from("sync_logs").select("id, status, errors, started_at");

  if (startDateStr && endDateStr) {
    wQuery = wQuery.gte("received_at", startDateStr).lte("received_at", endDateStr);
    oQuery = oQuery.gte("created_at", startDateStr).lte("created_at", endDateStr);
    sQuery = sQuery.gte("started_at", startDateStr).lte("started_at", endDateStr);
  }

  const [wRes, oRes, sRes, recentErrorsRes] = await Promise.all([
    wQuery,
    oQuery,
    sQuery,
    supabase
      .from("webhook_logs")
      .select("*")
      .not("error", "is", null)
      .order("received_at", { ascending: false })
      .limit(5),
  ]);

  const webhooks = wRes.data || [];
  const orderEvents = oRes.data || [];
  const syncs = sRes.data || [];

  let shopifyCount = 0;
  let pathaoCount = 0;
  let smsCount = 0;
  let webhookErrors = 0;

  for (const w of (webhooks as any[])) {
    if (w.source === "shopify") shopifyCount++;
    else if (w.source === "pathao") pathaoCount++;
    else if (w.source === "sms") smsCount++;

    if (w.error) webhookErrors++;
  }

  const syncErrors = (syncs as any[]).filter((s: any) => s.status === "failed" || (s.errors && s.errors > 0)).length;
  const totalLogs = webhooks.length + orderEvents.length + syncs.length;
  const errorCount = webhookErrors + syncErrors;
  const successCount = Math.max(0, totalLogs - errorCount);
  const successRate = totalLogs > 0 ? Number(((successCount / totalLogs) * 100).toFixed(1)) : 100;

  return {
    totalLogs,
    successCount,
    errorCount,
    successRate,
    shopifyCount,
    pathaoCount,
    smsCount,
    orderAuditCount: orderEvents.length,
    syncCount: syncs.length,
    recentErrors: (recentErrorsRes.data || []).map(normalizeWebhookLog),
  };
}
