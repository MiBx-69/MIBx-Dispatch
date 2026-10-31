import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyPathaoWebhook } from "@/lib/pathao/client";
import {
  normalizePathaoEvent,
  computePathaoEventIdempotencyKey,
} from "@/lib/pathao/status-engine";
import {
  processPathaoWebhookEvent,
  type PathaoWebhookPayload,
} from "@/lib/pathao/webhook-processor";
import { enqueueJob } from "@/lib/qstash";

async function resolvePathaoWebhookSecret(): Promise<string> {
  const envSecret = process.env.PATHAO_WEBHOOK_SECRET?.trim();
  if (envSecret) return envSecret;

  try {
    const supabase = createServiceClient();
    const { data: settings } = await supabase
      .from("app_settings")
      .select("pathao_webhook_secret")
      .limit(1)
      .maybeSingle();

    if (settings?.pathao_webhook_secret?.trim()) {
      return settings.pathao_webhook_secret.trim();
    }
  } catch {
    // ignore DB lookup error during fallback
  }

  return "";
}

function buildResponseHeaders(secret: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(secret
      ? { "X-Pathao-Merchant-Webhook-Integration-Secret": secret }
      : {}),
  };
}

/**
 * GET /api/webhooks/pathao
 * Health / integration handshake endpoint for Pathao Webhook verification.
 */
export async function GET() {
  const secret = await resolvePathaoWebhookSecret();
  return NextResponse.json(
    {
      status: "accepted",
      message: "Pathao Webhook Endpoint Active",
      webhook_url: "https://orders.universesraw.com/api/webhooks/pathao",
    },
    { status: 202, headers: buildResponseHeaders(secret) }
  );
}

/**
 * POST /api/webhooks/pathao
 * Receives real-time Pathao parcel lifecycle and payment invoice events,
 * validates signature/secret, stores raw event immutably, and returns 202 fast.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const configuredSecret = await resolvePathaoWebhookSecret();
  const responseHeaders = buildResponseHeaders(configuredSecret);

  // 1. Parse JSON safely
  let payload: PathaoWebhookPayload = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400, headers: responseHeaders }
    );
  }

  const rawEventStr =
    payload.event ||
    payload.order_status_slug ||
    payload.order_status ||
    "unknown";
  const norm = normalizePathaoEvent(rawEventStr);

  // 2. Validate Webhook Secret / Signature
  // Supports X-PATHAO-Signature (documented), X-Pathao-Merchant-Webhook-Integration-Secret, or Authorization
  const incomingSignature =
    request.headers.get("x-pathao-signature") ||
    request.headers.get("X-PATHAO-Signature") ||
    request.headers.get("x-pathao-merchant-webhook-integration-secret") ||
    request.headers.get("authorization") ||
    "";

  // Handshake (`webhook_integration`) verification: if a signature header is sent, verify it;
  // always return 202 with `X-Pathao-Merchant-Webhook-Integration-Secret` header.
  if (norm.normalizedStatus === "WEBHOOK_INTEGRATION") {
    if (
      configuredSecret &&
      incomingSignature &&
      !verifyPathaoWebhook(rawBody, incomingSignature, configuredSecret)
    ) {
      return NextResponse.json(
        { error: "Unauthorized webhook signature" },
        { status: 401, headers: responseHeaders }
      );
    }

    try {
      const supabase = createServiceClient();
      await supabase.from("webhook_logs").insert({
        source: "pathao",
        topic: "webhook_integration",
        event_type: "WEBHOOK_INTEGRATION",
        normalized_event: "WEBHOOK_INTEGRATION",
        payload: payload as any,
        processed: true,
        processing_status: "processed",
        shopify_sync_status: "not_required",
      });
    } catch {
      // Non-fatal during handshake
    }

    return NextResponse.json(
      { status: "accepted", message: "Webhook integration verified" },
      { status: 202, headers: responseHeaders }
    );
  }

  // Enforce secret validation on all parcel/financial events when a secret is configured
  if (configuredSecret) {
    const isValid = verifyPathaoWebhook(
      rawBody,
      incomingSignature,
      configuredSecret
    );
    if (!isValid) {
      console.error("[Pathao Webhook] Invalid or missing X-PATHAO-Signature");
      return NextResponse.json(
        { error: "Unauthorized: Invalid X-PATHAO-Signature" },
        { status: 401, headers: responseHeaders }
      );
    }
  }

  // 3. Validate required fields for non-handshake events
  const consignmentId = payload.consignment_id
    ? String(payload.consignment_id).trim()
    : null;
  const merchantOrderId = payload.merchant_order_id
    ? String(payload.merchant_order_id).trim()
    : null;

  if (!consignmentId && !merchantOrderId) {
    return NextResponse.json(
      { error: "Missing consignment_id and merchant_order_id" },
      { status: 400, headers: responseHeaders }
    );
  }

  // 4. Compute deterministic idempotency key & persist raw event before returning 202
  const idempotencyKey = computePathaoEventIdempotencyKey({
    consignment_id: consignmentId,
    merchant_order_id: merchantOrderId,
    event: rawEventStr,
    updated_at: payload.updated_at,
    timestamp: payload.timestamp,
    reason: payload.reason,
    invoice_id:
      payload.invoice_id ||
      payload.payment_invoice_id ||
      payload.invoice_reference,
  });

  const supabase = createServiceClient();

  // Check if this exact webhook was already logged and processed
  const { data: existingLog } = await supabase
    .from("webhook_logs")
    .select("id, processed, processing_status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingLog && existingLog.processed) {
    return NextResponse.json(
      {
        status: "accepted",
        duplicate: true,
        idempotency_key: idempotencyKey,
        normalized_status: norm.normalizedStatus,
      },
      { status: 202, headers: responseHeaders }
    );
  }

  let webhookLogId: string | null = existingLog?.id || null;
  if (!webhookLogId) {
    const { data: insertedLog } = await supabase
      .from("webhook_logs")
      .insert({
        source: "pathao",
        topic: String(rawEventStr),
        event_type: norm.normalizedStatus,
        normalized_event: norm.normalizedStatus,
        pathao_consignment_id: consignmentId,
        merchant_order_id: merchantOrderId,
        event_timestamp:
          payload.updated_at || payload.timestamp || new Date().toISOString(),
        idempotency_key: idempotencyKey,
        payload: payload as any,
        processed: false,
        processing_status: "pending",
        shopify_sync_status: "pending",
      })
      .select("id")
      .maybeSingle();

    webhookLogId = insertedLog?.id || null;
  }

  // 5. Execute processing (supports immediate sync mode for tests/retry or async background processing)
  const syncMode =
    request.headers.get("x-sync-process") === "true" ||
    process.env.NODE_ENV === "test";

  if (syncMode) {
    const result = await processPathaoWebhookEvent({
      payload,
      webhookLogId,
    });
    return NextResponse.json(
      {
        status: "accepted",
        processed: result.success,
        duplicate: result.duplicate,
        ignored_out_of_order: result.ignoredOutOfOrder,
        normalized_status: result.normalizedStatus,
        display_label: result.displayLabel,
        reconciliation_required: result.reconciliationRequired,
        shopify_synced: result.shopifySynced,
      },
      { status: 202, headers: responseHeaders }
    );
  }

  // Enqueue via QStash or process via Next.js after() so HTTP 202 returns in <200ms
  const qstashJobId = await enqueueJob(
    "/api/jobs/process-pathao-webhook",
    {
      payload,
      webhookLogId,
    },
    {
      deduplicationId: idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_"),
    }
  );

  if (!qstashJobId) {
    try {
      after(async () => {
        try {
          await processPathaoWebhookEvent({ payload, webhookLogId });
        } catch (err) {
          console.error("[Pathao Webhook] Background processing failed:", err);
        }
      });
    } catch {
      // Fallback if after() is called outside request context
      await processPathaoWebhookEvent({ payload, webhookLogId });
    }
  }

  return NextResponse.json(
    {
      status: "accepted",
      queued: true,
      idempotency_key: idempotencyKey,
      normalized_status: norm.normalizedStatus,
    },
    { status: 202, headers: responseHeaders }
  );
}
