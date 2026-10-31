import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runPathaoReconciliation } from "@/app/api/pathao/sync-status/route";
import { Receiver } from "@upstash/qstash";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for serverless runtimes

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  const supabase = createServiceClient();

  // 1. Validate request — QStash signature (primary) or CRON_SECRET fallback
  const { data: settings } = await supabase
    .from("app_settings")
    .select("*")
    .maybeSingle();

  const qstashCurrentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const qstashNextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (qstashCurrentKey && qstashNextKey) {
    const receiver = new Receiver({
      currentSigningKey: qstashCurrentKey,
      nextSigningKey: qstashNextKey,
    });
    const rawBody = await request.text();
    const signature = request.headers.get("upstash-signature") ?? "";
    const isValid = await receiver
      .verify({ signature, body: rawBody })
      .catch(() => false);
    if (!isValid) {
      return NextResponse.json(
        { error: "Unauthorized. Invalid QStash signature." },
        { status: 401 }
      );
    }
  } else {
    const configuredSecret = process.env.CRON_SECRET || settings?.cron_secret;
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;
    const querySecret = request.nextUrl.searchParams.get("secret");
    const providedSecret = (bearerToken || querySecret || "").trim();

    const safeCompare = (a: string, b: string): boolean => {
      if (!a || !b) return false;
      const bufA = Buffer.from(a);
      const bufB = Buffer.from(b);
      if (bufA.length !== bufB.length) return false;
      return timingSafeEqual(bufA, bufB);
    };

    if (
      !configuredSecret ||
      !providedSecret ||
      !safeCompare(providedSecret, configuredSecret)
    ) {
      return NextResponse.json(
        { error: "Unauthorized. Invalid or missing cron secret." },
        { status: 401 }
      );
    }
  }

  try {
    const result = await runPathaoReconciliation({
      limit: 200,
      retryFailedWebhooks: true,
    });

    await supabase.from("webhook_logs").insert({
      event_type: "cron/courier_sync",
      topic: "cron/courier_sync",
      source: "cron",
      payload: {
        total_scanned: result.totalChecked,
        total_updated: result.updatedCount,
        retried_webhooks: result.retriedWebhooks,
        duration_ms: result.durationMs,
        errors_count: result.errorCount,
      } as any,
      processed: true,
      processing_status: result.errorCount > 0 ? "failed" : "processed",
      error:
        result.errorCount > 0
          ? `${result.errorCount} item errors encountered`
          : null,
    });

    return NextResponse.json({
      success: true,
      scanned: result.totalChecked,
      updated: result.updatedCount,
      retried_webhooks: result.retriedWebhooks,
      duration_ms: result.durationMs,
      errors_count: result.errorCount,
    });
  } catch (err: any) {
    console.error("[Cron Sync] Execution error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
