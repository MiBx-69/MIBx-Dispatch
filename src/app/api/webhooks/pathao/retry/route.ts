import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processPathaoWebhookEvent } from "@/lib/pathao/webhook-processor";

/**
 * POST /api/webhooks/pathao/retry
 * Retries a specific webhook log entry (by webhookLogId) or retries all failed
 * Pathao webhook / Shopify sync events when `{ retryAllFailed: true }` is sent.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createServiceClient();

    if (body.webhookLogId) {
      const { data: logRow, error } = await supabase
        .from("webhook_logs")
        .select("*")
        .eq("id", body.webhookLogId)
        .single();

      if (error || !logRow) {
        return NextResponse.json(
          { error: "Webhook log not found" },
          { status: 404 }
        );
      }

      const nextRetryCount = (Number(logRow.retry_count) || 0) + 1;
      await supabase
        .from("webhook_logs")
        .update({
          processing_status: "retrying",
          retry_count: nextRetryCount,
          last_retry_at: new Date().toISOString(),
        })
        .eq("id", logRow.id);

      const result = await processPathaoWebhookEvent({
        payload: (logRow.payload as any) || {},
        webhookLogId: logRow.id,
        forceRetry: true,
        skipSms: true, // Prevent duplicate customer SMS on manual retry
      });

      return NextResponse.json({
        success: result.success && result.shopifySynced,
        retryCount: nextRetryCount,
        result,
      });
    }

    if (body.retryAllFailed) {
      const { data: failedLogs } = await supabase
        .from("webhook_logs")
        .select("*")
        .eq("source", "pathao")
        .or(
          "processing_status.eq.failed,shopify_sync_status.eq.failed,processed.eq.false"
        )
        .order("received_at", { ascending: true })
        .limit(50);

      const logsToRetry = failedLogs || [];
      let succeeded = 0;
      let failed = 0;

      for (const logRow of logsToRetry) {
        const nextRetryCount = (Number(logRow.retry_count) || 0) + 1;
        await supabase
          .from("webhook_logs")
          .update({
            processing_status: "retrying",
            retry_count: nextRetryCount,
            last_retry_at: new Date().toISOString(),
          })
          .eq("id", logRow.id);

        const res = await processPathaoWebhookEvent({
          payload: (logRow.payload as any) || {},
          webhookLogId: logRow.id,
          forceRetry: true,
          skipSms: true,
        });

        if (res.success && res.shopifySynced) {
          succeeded++;
        } else {
          failed++;
        }
      }

      return NextResponse.json({
        success: true,
        retriedCount: logsToRetry.length,
        succeeded,
        failed,
      });
    }

    return NextResponse.json(
      { error: "Provide webhookLogId or retryAllFailed: true" },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to retry webhook" },
      { status: 500 }
    );
  }
}

