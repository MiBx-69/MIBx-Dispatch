import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPathaoOrderStatus } from "@/lib/pathao/client";
import { markShopifyOrderAsDelivered } from "@/lib/shopify/client";
import { Receiver } from "@upstash/qstash";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for serverless runtimes

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

async function handleCron(request: NextRequest) {
  const startTime = Date.now();
  const supabase = createServiceClient();

  // 1. Validate request — QStash signature (primary) or CRON_SECRET fallback
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  const qstashCurrentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const qstashNextKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (qstashCurrentKey && qstashNextKey) {
    // QStash signature verification
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
    // Fallback: custom CRON_SECRET for manual / dev triggering
    const configuredSecret = process.env.CRON_SECRET || settings?.cron_secret;
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;
    const querySecret = request.nextUrl.searchParams.get("secret");
    const providedSecret = bearerToken || querySecret;
    if (configuredSecret && providedSecret !== configuredSecret) {
      return NextResponse.json({ error: "Unauthorized. Invalid cron secret." }, { status: 401 });
    }
  }

  try {
    // 3. Scan orders dispatched within the last 7 days that are not finalized
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);
    const cutoffISO = cutoffDate.toISOString();

    const { data: dispatches, error: dispatchErr } = await supabase
      .from("dispatches")
      .select(`
        id,
        consignment_id,
        pathao_order_status,
        order_id,
        shopify_order_name,
        dispatched_at,
        orders (
          id,
          shopify_order_id,
          shopify_order_name,
          shopify_fulfillment_id,
          internal_status,
          pathao_delivery_status,
          delivered_at,
          customer_phone,
          customer_name
        )
      `)
      .not("consignment_id", "is", null)
      .eq("is_cancelled", false)
      .gte("dispatched_at", cutoffISO)
      .order("dispatched_at", { ascending: false });

    if (dispatchErr) throw dispatchErr;

    let scannedCount = 0;
    let updatedCount = 0;
    const errors: any[] = [];
    const updatedDetails: any[] = [];

    // Process in batches of 2 with concurrency limit to respect Pathao API rate limits
    const BATCH_SIZE = 2;
    for (let i = 0; i < (dispatches?.length || 0); i += BATCH_SIZE) {
      const batch = dispatches!.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (d: any) => {
          try {
            scannedCount++;
            const infoRes = await getPathaoOrderStatus(d.consignment_id);
            const data = infoRes?.data;
            if (!data?.order_status) return;

            const currentStatus = (d.pathao_order_status || "").toLowerCase().trim();
            const newStatus = (data.order_status || "").toLowerCase().trim();

            if (currentStatus === newStatus) return;

            // STRICT SYSTEM POLICY: Skip partial delivery completely
            if (newStatus.includes("partial")) {
              return;
            }

            const now = new Date().toISOString();
            const orderId = (d.orders as any)?.id;
            const shopifyOrderId = (d.orders as any)?.shopify_order_id;
            const shopifyFulfillmentId = (d.orders as any)?.shopify_fulfillment_id;

            // 1. Delivered
            if (
              newStatus.includes("delivered") ||
              newStatus.includes("payment_received") ||
              newStatus.includes("payment invoice")
            ) {
              if (d.id) {
                await supabase.from("dispatches").update({
                  pathao_order_status: "Delivered",
                  updated_at: now,
                }).eq("id", d.id);
              }

              if (orderId) {
                await supabase.from("orders").update({
                  internal_status: "delivered",
                  pathao_delivery_status: "Delivered",
                  delivered_at: now,
                }).eq("id", orderId);

                // Mark as Delivered on Shopify
                try {
                  await markShopifyOrderAsDelivered({
                    shopifyOrderId,
                    shopifyFulfillmentId,
                    consignmentId: d.consignment_id,
                  });
                } catch (shopifyErr) {
                  console.error("[Cron Sync] Failed to mark order delivered on Shopify:", shopifyErr);
                }
              }
              updatedCount++;
              updatedDetails.push({
                consignment_id: d.consignment_id,
                order: d.shopify_order_name,
                newStatus: "Delivered",
              });
            }
            // 2. Returned
            else if (newStatus.includes("return") || newStatus.includes("returned")) {
              if (d.id) {
                await supabase.from("dispatches").update({
                  pathao_order_status: "Returned",
                  updated_at: now,
                }).eq("id", d.id);
              }

              if (orderId) {
                await supabase.from("orders").update({
                  pathao_delivery_status: "Returned",
                }).eq("id", orderId);
              }
              updatedCount++;
              updatedDetails.push({
                consignment_id: d.consignment_id,
                order: d.shopify_order_name,
                newStatus: "Returned (Courier)",
              });
            }
            // 3. Out for Delivery / Assigned for Delivery
            else if (
              newStatus.includes("out_for_delivery") ||
              newStatus.includes("out for delivery") ||
              newStatus.includes("assigned for delivery") ||
              newStatus.includes("assigned_for_delivery")
            ) {
              if (d.id) {
                await supabase.from("dispatches").update({
                  pathao_order_status: "Assigned for Delivery",
                  updated_at: now,
                }).eq("id", d.id);
              }

              if (orderId) {
                await supabase.from("orders").update({
                  pathao_delivery_status: "Assigned for Delivery",
                  internal_status: "dispatched",
                }).eq("id", orderId);
              }
              updatedCount++;
            }
            // 4. Cancelled
            else if (newStatus.includes("cancel") || newStatus.includes("cancelled")) {
              if (d.id) {
                await supabase.from("dispatches").update({
                  pathao_order_status: "Cancelled",
                  is_cancelled: true,
                  cancelled_at: now,
                  cancel_reason: "Cancelled via Pathao Courier Scan",
                  updated_at: now,
                }).eq("id", d.id);
              }

              if (orderId) {
                await supabase.from("orders").update({
                  internal_status: "cancelled",
                  pathao_delivery_status: "Cancelled",
                  cancel_reason: "Cancelled via Pathao Courier Scan",
                }).eq("id", orderId);
              }
              updatedCount++;
            }
            // 5. In Transit / Other
            else {
              if (d.id) {
                await supabase.from("dispatches").update({
                  pathao_order_status: data.order_status,
                  updated_at: now,
                }).eq("id", d.id);
              }

              if (orderId) {
                await supabase.from("orders").update({
                  pathao_delivery_status: data.order_status,
                }).eq("id", orderId);
              }
            }
          } catch (err: any) {
            errors.push({ consignment_id: d.consignment_id, error: err.message });
          }
        })
      );
      if (i + BATCH_SIZE < (dispatches?.length || 0)) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    const durationMs = Date.now() - startTime;

    // 4. Record execution log in webhook_logs
    await supabase.from("webhook_logs").insert({
      event_type: "cron/courier_sync",
      topic: "cron/courier_sync",
      source: "cron",
      payload: {
        total_scanned: scannedCount,
        total_updated: updatedCount,
        duration_ms: durationMs,
        updated_details: updatedDetails,
        errors_count: errors.length,
      },
      processed: true,
      error: errors.length > 0 ? `${errors.length} item errors encountered` : null,
    });

    return NextResponse.json({
      success: true,
      scanned: scannedCount,
      updated: updatedCount,
      duration_ms: durationMs,
      updated_details: updatedDetails,
      errors_count: errors.length,
    });
  } catch (err: any) {
    console.error("[Cron Sync] Execution error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
