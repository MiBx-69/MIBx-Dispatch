import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPathaoOrderStatus } from "@/lib/pathao/client";
import { normalizePathaoEvent } from "@/lib/pathao/status-engine";
import { processPathaoWebhookEvent } from "@/lib/pathao/webhook-processor";

const TERMINAL_NORMALIZED_STATUSES = [
  "DELIVERED",
  "PARTIALLY_DELIVERED",
  "RETURNED_TO_MERCHANT",
  "PICKUP_CANCELLED",
];

const TERMINAL_DISPLAY_STATUSES = [
  "Delivered",
  "Partial Delivered",
  "Returned to Merchant",
  "Return Completed",
  "Pickup Cancelled",
  "Cancelled",
];

export async function runPathaoReconciliation(options?: {
  limit?: number;
  consignmentIds?: string[];
  retryFailedWebhooks?: boolean;
}) {
  const startTime = Date.now();
  const supabase = createServiceClient();
  const limit = options?.limit || 150;

  const startedAtIso = new Date().toISOString();
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({
      sync_type: "pathao_reconciliation",
      status: "running",
      orders_synced: 0,
      errors: 0,
      started_at: startedAtIso,
    })
    .select("id")
    .maybeSingle();

  try {
    // 1. Retry any failed Pathao webhook events or failed Shopify syncs first
    let retriedWebhooks = 0;
    if (options?.retryFailedWebhooks !== false) {
      const { data: failedLogs } = await supabase
        .from("webhook_logs")
        .select("*")
        .eq("source", "pathao")
        .or("processing_status.eq.failed,shopify_sync_status.eq.failed")
        .lt("retry_count", 5)
        .order("received_at", { ascending: true })
        .limit(25);

      if (failedLogs && failedLogs.length > 0) {
        for (const logRow of failedLogs) {
          const nextRetry = (Number(logRow.retry_count) || 0) + 1;
          await supabase
            .from("webhook_logs")
            .update({
              processing_status: "retrying",
              retry_count: nextRetry,
              last_retry_at: new Date().toISOString(),
            })
            .eq("id", logRow.id);

          await processPathaoWebhookEvent({
            payload: (logRow.payload as any) || {},
            webhookLogId: logRow.id,
            forceRetry: true,
            skipSms: true,
          });
          retriedWebhooks++;
        }
      }
    }

    // 2. Query active parcels + return-in-transit parcels (non-terminal)
    let query = supabase
      .from("dispatches")
      .select(
        "id, order_id, consignment_id, merchant_order_id, pathao_order_status, normalized_status, last_event_timestamp, shopify_sync_status"
      )
      .eq("is_cancelled", false)
      .not("consignment_id", "is", null)
      .order("dispatched_at", { ascending: false })
      .limit(limit);

    if (options?.consignmentIds && options.consignmentIds.length > 0) {
      query = query.in("consignment_id", options.consignmentIds);
    } else {
      query = query.not(
        "pathao_order_status",
        "in",
        `(${TERMINAL_DISPLAY_STATUSES.map((s) => `"${s}"`).join(",")})`
      );
    }

    const { data: activeDispatches, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const dispatchesToCheck = (activeDispatches || []).filter((d) => {
      if (options?.consignmentIds?.length) return true;
      if (
        d.normalized_status &&
        TERMINAL_NORMALIZED_STATUSES.includes(d.normalized_status) &&
        d.shopify_sync_status !== "failed"
      ) {
        return false;
      }
      return true;
    });

    let updatedCount = 0;
    let errorCount = 0;
    const errors: Array<{ consignment_id: string; error: string }> = [];

    // Low concurrency + pause between batches to stay under Pathao rate limits (429)
    const CONCURRENCY = 2;
    for (let i = 0; i < dispatchesToCheck.length; i += CONCURRENCY) {
      if (i > 0) await new Promise((r) => setTimeout(r, 400));
      const batch = dispatchesToCheck.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (dispatch) => {
          try {
            const res = await getPathaoOrderStatus(dispatch.consignment_id);
            const info = res?.data || res;
            const liveRawStatus =
              info?.order_status_slug ||
              info?.order_status ||
              info?.status ||
              null;

            if (!liveRawStatus) return;

            const liveNorm = normalizePathaoEvent(liveRawStatus);
            const currentNorm = normalizePathaoEvent(
              dispatch.normalized_status || dispatch.pathao_order_status
            );

            // Process if status changed OR if previous Shopify sync failed
            if (
              liveNorm.normalizedStatus !== currentNorm.normalizedStatus ||
              dispatch.shopify_sync_status === "failed"
            ) {
              const proc = await processPathaoWebhookEvent({
                payload: {
                  consignment_id: dispatch.consignment_id,
                  merchant_order_id: dispatch.merchant_order_id || undefined,
                  event: liveRawStatus,
                  order_status: info?.order_status,
                  order_status_slug: info?.order_status_slug,
                  updated_at: info?.updated_at || new Date().toISOString(),
                  delivery_fee: info?.delivery_fee,
                  force_reconcile: true,
                },
                forceRetry: dispatch.shopify_sync_status === "failed",
              });

              if (proc.success && !proc.ignoredOutOfOrder) {
                updatedCount++;
              }
            }
          } catch (err: any) {
            errorCount++;
            errors.push({
              consignment_id: dispatch.consignment_id,
              error: err.message || "Reconciliation check failed",
            });
          }
        })
      );
    }

    const durationMs = Date.now() - startTime;
    if (syncLog?.id) {
      await supabase
        .from("sync_logs")
        .update({
          status: errorCount > 0 && updatedCount === 0 ? "failed" : "completed",
          orders_synced: updatedCount,
          errors: errorCount,
          error_details: errors.length > 0 ? (errors as any) : null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }

    return {
      success: true,
      checked: dispatchesToCheck.length,
      totalChecked: dispatchesToCheck.length,
      updated: updatedCount,
      updatedCount,
      retriedWebhooks,
      errorCount,
      durationMs,
      lastReconciliationAt: new Date().toISOString(),
    };
  } catch (err: any) {
    if (syncLog?.id) {
      await supabase
        .from("sync_logs")
        .update({
          status: "failed",
          errors: 1,
          error_details: { message: err.message } as any,
          completed_at: new Date().toISOString(),
        })
        .eq("id", syncLog.id);
    }
    throw err;
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const result = await runPathaoReconciliation({
      limit: body.limit,
      consignmentIds: body.consignmentIds,
      retryFailedWebhooks: body.retryFailedWebhooks,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to reconcile Pathao statuses" },
      { status: 500 }
    );
  }
}
