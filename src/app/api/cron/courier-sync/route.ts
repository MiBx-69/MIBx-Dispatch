import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPathaoOrderStatus } from "@/lib/pathao/client";
import { markShopifyOrderAsDelivered, markShopifyOrderAsPartialDelivered } from "@/lib/shopify/client";
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
      .not(
        "pathao_order_status",
        "in",
        '("Delivered","Returned","Return","Paid Return","Partial Delivered","Pickup Cancel","Pickup Failed","Cancelled","order.delivered","order.returned","order.cancelled")'
      )
      .gte("dispatched_at", cutoffISO)
      .order("dispatched_at", { ascending: false });

    if (dispatchErr) throw dispatchErr;

    let scannedCount = 0;
    let updatedCount = 0;
    const errors: any[] = [];
    const updatedDetails: any[] = [];

    // Filter out any dispatch whose linked order already has a terminal status
    const dispatchList = (dispatches || []).filter((d: any) => {
      const order = Array.isArray(d.orders) ? d.orders[0] : d.orders;
      const orderStatus = (order?.internal_status || "").toLowerCase().trim();
      return !["delivered", "returned", "cancelled", "partial_delivered"].includes(orderStatus);
    });
    for (let i = 0; i < dispatchList.length; i++) {
      const d = dispatchList[i];
      try {
        scannedCount++;
        const infoRes = await getPathaoOrderStatus(d.consignment_id);
        const data = infoRes?.data;
        if (!data?.order_status) {
          if (i + 1 < dispatchList.length) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          continue;
        }

        const normalizeStatus = (s: string) => (s || "").toLowerCase().replace(/[_\s]+/g, " ").trim();
        const currentStatus = normalizeStatus(d.pathao_order_status || "");
        const newStatus = normalizeStatus(data.order_status || "");

        if (currentStatus === newStatus) {
          if (i + 1 < dispatchList.length) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
          continue;
        }

            const now = new Date().toISOString();
            const orderId = (d.orders as any)?.id;
            const shopifyOrderId = (d.orders as any)?.shopify_order_id;
            const shopifyFulfillmentId = (d.orders as any)?.shopify_fulfillment_id;

            // 1. Partial Delivery
            if (newStatus.includes("partial")) {
              if (d.id) {
                await supabase.from("dispatches").update({
                  pathao_order_status: "Partial Delivered",
                  updated_at: now,
                }).eq("id", d.id);
              }

              if (orderId) {
                await supabase.from("orders").update({
                  internal_status: "delivered",
                  pathao_delivery_status: "Partial Delivered",
                  delivered_at: now,
                }).eq("id", orderId);

                // Record in returns if not already present
                const { data: existingReturn } = await supabase
                  .from("returns")
                  .select("id")
                  .eq("order_id", orderId)
                  .maybeSingle();

                if (!existingReturn) {
                  await supabase.from("returns").insert({
                    order_id: orderId,
                    dispatch_id: d.id || null,
                    consignment_id: d.consignment_id,
                    return_type: "partial",
                    return_source: "cron_sync",
                    order_total: Number(d.amount_to_collect || (d.orders as any)?.total_price) || 0,
                    return_delivery_fee: 0,
                    status: "pending_verification",
                    is_verified: false,
                    return_reason: "Pathao Partial Delivery",
                    returned_at: now,
                  });
                }

                // Auto-sync with Shopify
                try {
                  await markShopifyOrderAsPartialDelivered({
                    shopifyOrderId,
                    shopifyFulfillmentId,
                    consignmentId: d.consignment_id,
                  });
                } catch (shopifyErr) {
                  console.error("[Cron Sync] Failed to mark order partial delivery on Shopify:", shopifyErr);
                }
              }
              updatedCount++;
              updatedDetails.push({
                consignment_id: d.consignment_id,
                order: d.shopify_order_name,
                newStatus: "Partial Delivered",
              });
            }
            // 2. Returned / Paid Return
            else if (newStatus.includes("return") || newStatus.includes("returned")) {
              const returnLabel = newStatus.includes("paid") ? "Paid Return" : "Returned";
              if (d.id) {
                await supabase.from("dispatches").update({
                  pathao_order_status: returnLabel,
                  updated_at: now,
                }).eq("id", d.id);
              }

              if (orderId) {
                await supabase.from("orders").update({
                  pathao_delivery_status: returnLabel,
                  internal_status: "returned",
                  returned_at: now,
                  return_reason: returnLabel === "Paid Return" ? "Paid Return via Pathao" : "Returned via Pathao",
                }).eq("id", orderId);
              }
              updatedCount++;
              updatedDetails.push({
                consignment_id: d.consignment_id,
                order: d.shopify_order_name,
                newStatus: returnLabel,
              });
            }
            // 3. Delivered
            else if (
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
            // 3. Ready for Delivery / Assigned for Delivery / Out for Delivery
            else if (
              newStatus.includes("out_for_delivery") ||
              newStatus.includes("out for delivery") ||
              newStatus.includes("assigned for delivery") ||
              newStatus.includes("assigned_for_delivery") ||
              newStatus.includes("ready for delivery") ||
              newStatus.includes("ready_for_delivery")
            ) {
              let label = data.order_status;
              if (newStatus.includes("out")) label = "Out for Delivery";
              else if (newStatus.includes("assigned")) label = "Assigned for Delivery";
              else if (newStatus.includes("ready")) label = "Ready for Delivery";

              if (normalizeStatus(label) === currentStatus) {
                if (i + 1 < dispatchList.length) {
                  await new Promise((resolve) => setTimeout(resolve, 200));
                }
                continue;
              }
              if (d.id) {
                await supabase.from("dispatches").update({
                  pathao_order_status: label,
                  updated_at: now,
                }).eq("id", d.id);
              }

              if (orderId) {
                await supabase.from("orders").update({
                  pathao_delivery_status: label,
                  internal_status: "dispatched",
                  delivered_at: null,
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
            // 5. Pickup Holds & Failures
            else if (newStatus.includes("hold") || newStatus.includes("failed")) {
              const label = data.order_status;
              if (d.id) {
                await supabase.from("dispatches").update({
                  pathao_order_status: label,
                  updated_at: now,
                }).eq("id", d.id);
              }

              if (orderId) {
                await supabase.from("orders").update({
                  internal_status: "hold",
                  pathao_delivery_status: label,
                  delivered_at: null,
                }).eq("id", orderId);
              }
              updatedCount++;
            }
            // 6. In Transit / Other
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

          if (i + 1 < dispatchList.length) {
            await new Promise((resolve) => setTimeout(resolve, 200));
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
