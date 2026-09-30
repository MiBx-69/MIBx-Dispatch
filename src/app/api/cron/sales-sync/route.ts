import { type NextRequest, NextResponse } from "next/server";
import { runFullShopifySalesSync } from "@/lib/shopify-sales-sync";
import { Receiver } from "@upstash/qstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  // 1. Authorize: QStash signature or CRON_SECRET
  const qstashCurrentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const qstashNextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (qstashCurrentKey && qstashNextKey) {
    const receiver = new Receiver({
      currentSigningKey: qstashCurrentKey,
      nextSigningKey: qstashNextKey,
    });
    const rawBody = await request.text();
    const signature = request.headers.get("upstash-signature") ?? "";
    const isValid = await receiver.verify({ signature, body: rawBody }).catch(() => false);
    if (!isValid) {
      return NextResponse.json({ error: "Unauthorized. Invalid QStash signature." }, { status: 401 });
    }
  } else {
    // Fail closed if CRON_SECRET is unset or mismatch
    const configuredSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const querySecret = request.nextUrl.searchParams.get("secret");
    const providedSecret = (bearerToken || querySecret || "").trim();

    const safeCompare = (a: string, b: string): boolean => {
      if (!a || !b) return false;
      const bufA = Buffer.from(a);
      const bufB = Buffer.from(b);
      if (bufA.length !== bufB.length) return false;
      const crypto = require("crypto");
      return crypto.timingSafeEqual(bufA, bufB);
    };

    if (!configuredSecret || !providedSecret || !safeCompare(providedSecret, configuredSecret)) {
      return NextResponse.json({ error: "Unauthorized. Invalid or missing cron secret." }, { status: 401 });
    }
  }

  // 2. Execute sync (delta sync by default for scheduled runs)
  const fullSync = request.nextUrl.searchParams.get("fullSync") === "true";
  const result = await runFullShopifySalesSync({ fullSync });

  return NextResponse.json({
    status: result.success ? "success" : "failed",
    timestamp: new Date().toISOString(),
    result,
  });
}
