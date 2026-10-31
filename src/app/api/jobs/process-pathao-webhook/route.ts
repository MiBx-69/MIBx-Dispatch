import { NextRequest, NextResponse } from "next/server";
import { verifyQStashSignature } from "@/lib/qstash";
import { processPathaoWebhookEvent } from "@/lib/pathao/webhook-processor";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("upstash-signature");

  const isVerified = await verifyQStashSignature(signature, rawBody);
  if (!isVerified) {
    return NextResponse.json({ error: "Invalid QStash signature" }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody);
    const result = await processPathaoWebhookEvent({
      payload: body.payload || body,
      webhookLogId: body.webhookLogId || null,
      forceRetry: Boolean(body.forceRetry),
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to process Pathao webhook job" },
      { status: 500 }
    );
  }
}

