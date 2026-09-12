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
  if (row.source === "sms") {
    reference = row.payload?.orderName || row.payload?.to || row.payload?.formattedPhone || row.payload?.originalPhone || (row.shopify_order_id ? `#${row.shopify_order_id}` : null) || row.payload?.idempotencyKey || null;
  } else if (row.shopify_order_id) {
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
    const to = row.payload?.to || row.payload?.formattedPhone || row.payload?.originalPhone || "customer";
    const msgPreview = row.payload?.msg ? ` "${row.payload.msg.slice(0, 45)}${row.payload.msg.length > 45 ? '...' : ''}"` : "";
    if (row.topic === "sms/sent") summary = `SMS sent to ${to}${msgPreview}`;
    else if (row.topic === "sms/duplicate_blocked") summary = `Duplicate SMS prevented for ${to}`;
    else if (row.topic === "sms/failed") summary = `SMS delivery failed to ${to}: ${row.error || "Provider error"}`;
    else if (row.topic === "sms/invalid_phone") summary = `SMS failed: Invalid phone format (${row.payload?.originalPhone || to})`;
    else if (row.topic === "sms/not_configured") summary = `SMS failed: API Key not configured`;
    else summary = `SMS ${row.topic}${msgPreview}`;
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
 * Fetches unified logs with search, filtering, and database pagination
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
  const offset = (page - 1) * pageSize;
  const dateFilter = params.dateFilter || "all";
  const { startDateStr, endDateStr } = resolveDateRange(dateFilter, params.startDate, params.endDate);

  const selectedSource = params.source || "all";
  const selectedStatus = params.status || "all";
  const search = params.search?.trim().toLowerCase();

  // -------------------------------------------------------------
  // Fast Path 1: Single Webhook Source (shopify, pathao, sms)
  // Direct SQL range pagination and exact count — ultra fast!
  // -------------------------------------------------------------
  if (["shopify", "pathao", "sms"].includes(selectedSource) && !search) {
    let q = supabase
      .from("webhook_logs")
      .select("*", { count: "exact" })
      .eq("source", selectedSource)
      .order("received_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (startDateStr && endDateStr) {
      q = q.gte("received_at", startDateStr).lte("received_at", endDateStr);
    }
    if (selectedStatus === "error") {
      q = q.not("error", "is", null);
    } else if (selectedStatus === "success") {
      q = q.is("error", null);
    }

    const { data, count } = await q;
    const totalCount = count || 0;
    return {
      logs: (data || []).map(normalizeWebhookLog),
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  }

  // -------------------------------------------------------------
  // Fast Path 2: Single Source: Errors Only (from webhook_logs)
  // -------------------------------------------------------------
  if (selectedSource === "error" && !search) {
    let q = supabase
      .from("webhook_logs")
      .select("*", { count: "exact" })
      .not("error", "is", null)
      .order("received_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (startDateStr && endDateStr) {
      q = q.gte("received_at", startDateStr).lte("received_at", endDateStr);
    }

    const { data, count } = await q;
    const totalCount = count || 0;
    return {
      logs: (data || []).map(normalizeWebhookLog),
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  }

  // -------------------------------------------------------------
  // Fast Path 3: Single Source: Order Events
  // -------------------------------------------------------------
  if (selectedSource === "order" && !search) {
    let q = supabase
      .from("order_events")
      .select("*, orders(shopify_order_name, shopify_order_number, customer_name, total_price, internal_status)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (startDateStr && endDateStr) {
      q = q.gte("created_at", startDateStr).lte("created_at", endDateStr);
    }

    const { data, count } = await q;
    const totalCount = count || 0;
    return {
      logs: (data || []).map(normalizeOrderEvent),
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  }

  // -------------------------------------------------------------
  // Fast Path 4: Single Source: Sync Logs
  // -------------------------------------------------------------
  if (selectedSource === "sync" && !search) {
    let q = supabase
      .from("sync_logs")
      .select("*", { count: "exact" })
      .order("started_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (startDateStr && endDateStr) {
      q = q.gte("started_at", startDateStr).lte("started_at", endDateStr);
    }
    if (selectedStatus === "error") {
      q = q.or("status.eq.failed,errors.gt.0");
    }

    const { data, count } = await q;
    const totalCount = count || 0;
    return {
      logs: (data || []).map(normalizeSyncLog),
      totalCount,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    };
  }

  // -------------------------------------------------------------
  // Path 5: Multi-source ("all") or Search mode
  // Controlled query size to avoid transferring massive JSON
  // -------------------------------------------------------------
  const fetchWebhookLogs = ["all", "shopify", "pathao", "sms", "error"].includes(selectedSource);
  const fetchOrderEvents = ["all", "order"].includes(selectedSource) && selectedStatus !== "error";
  const fetchSyncLogs = ["all", "sync", "error"].includes(selectedSource);

  // Controlled fetch limit proportional to page size rather than unbounded 500/1000
  const fetchLimit = search ? 150 : Math.min(100, page * pageSize + 20);

  const promises: Promise<any>[] = [];

  // 1. Query webhook_logs
  if (fetchWebhookLogs) {
    let q = supabase
      .from("webhook_logs")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(fetchLimit);

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

    if (search) {
      q = q.or(`topic.ilike.%${search}%,error.ilike.%${search}%,pathao_consignment_id.ilike.%${search}%`);
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
      .limit(Math.min(50, fetchLimit));

    if (startDateStr && endDateStr) {
      q = q.gte("created_at", startDateStr).lte("created_at", endDateStr);
    }

    if (search) {
      q = q.or(`event_type.ilike.%${search}%,description.ilike.%${search}%`);
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
      .limit(30);

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

  // Secondary in-memory search match for nested payload fields if search present
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
 * Computes high-level analytics for log monitoring dashboard.
 * Uses exact head counts from database metadata instead of downloading all rows!
 */
export async function getLogAnalytics(params: {
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
}): Promise<LogAnalyticsStats> {
  const supabase = createServiceClient();
  const dateFilter = params.dateFilter || "all";
  const { startDateStr, endDateStr } = resolveDateRange(dateFilter, params.startDate, params.endDate);

  const applyDate = (q: any, col: string) => {
    if (startDateStr && endDateStr) {
      return q.gte(col, startDateStr).lte(col, endDateStr);
    }
    return q;
  };

  const [
    wTotalRes,
    shopifyRes,
    pathaoRes,
    smsRes,
    wErrorsRes,
    oTotalRes,
    sTotalRes,
    sErrorsRes,
    recentErrorsRes,
  ] = await Promise.all([
    applyDate(supabase.from("webhook_logs").select("id", { count: "exact", head: true }), "received_at"),
    applyDate(supabase.from("webhook_logs").select("id", { count: "exact", head: true }).eq("source", "shopify"), "received_at"),
    applyDate(supabase.from("webhook_logs").select("id", { count: "exact", head: true }).eq("source", "pathao"), "received_at"),
    applyDate(supabase.from("webhook_logs").select("id", { count: "exact", head: true }).eq("source", "sms"), "received_at"),
    applyDate(supabase.from("webhook_logs").select("id", { count: "exact", head: true }).not("error", "is", null), "received_at"),
    applyDate(supabase.from("order_events").select("id", { count: "exact", head: true }), "created_at"),
    applyDate(supabase.from("sync_logs").select("id", { count: "exact", head: true }), "started_at"),
    applyDate(supabase.from("sync_logs").select("id", { count: "exact", head: true }).or("status.eq.failed,errors.gt.0"), "started_at"),
    applyDate(
      supabase
        .from("webhook_logs")
        .select("id, source, topic, shopify_order_id, pathao_consignment_id, payload, processed, error, received_at")
        .not("error", "is", null)
        .order("received_at", { ascending: false })
        .limit(5),
      "received_at"
    ),
  ]);

  const totalWebhooks = wTotalRes.count || 0;
  const shopifyCount = shopifyRes.count || 0;
  const pathaoCount = pathaoRes.count || 0;
  const smsCount = smsRes.count || 0;
  const webhookErrors = wErrorsRes.count || 0;
  const orderAuditCount = oTotalRes.count || 0;
  const syncCount = sTotalRes.count || 0;
  const syncErrors = sErrorsRes.count || 0;

  const totalLogs = totalWebhooks + orderAuditCount + syncCount;
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
    orderAuditCount,
    syncCount,
    recentErrors: (recentErrorsRes.data || []).map(normalizeWebhookLog),
  };
}
