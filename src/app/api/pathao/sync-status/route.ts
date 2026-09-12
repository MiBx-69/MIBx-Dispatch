import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPathaoOrderStatus } from "@/lib/pathao/client";
import { markShopifyOrderAsDelivered } from "@/lib/shopify/client";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceClient();
    const { searchParams } = new URL(request.url);

    // Support "all" or specific number of days (defaults to 7)
    const daysParam = searchParams.get("days");
    const isAll = daysParam === "all" || searchParams.get("all") === "true";
    const days = daysParam && !isAll ? Math.max(1, Number(daysParam) || 7) : 7;
    const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const isForce = searchParams.get("force") === "true";
    const requestedLimit = Number(searchParams.get("limit"));
    const batchLimit = requestedLimit && requestedLimit > 0 ? Math.min(requestedLimit, 1000) : (isAll ? 600 : 250);

    // 1. Fetch active dispatches
    let q = supabase
      .from("dispatches")
      .select(`
        id,
        consignment_id,
        pathao_order_status,
        amount_to_collect,
        delivery_fee,
        recipient_phone,
        recipient_name,
        shopify_order_name,
        dispatched_at,
        orders (
          id,
          shopify_order_id,
          shopify_fulfillment_id,
          internal_status,
          total_price,
          customer_phone,
          customer_name
        )
      `)
      .not("consignment_id", "is", null)
      .eq("is_cancelled", false)
      .order("dispatched_at", { ascending: false });

    if (!isAll) {
      q = q.gte("dispatched_at", daysAgo);
    }

    if (!isForce) {
      q = q.not(
        "pathao_order_status",
        "in",
        '("Delivered","Returned","Cancelled","order.delivered","order.returned","order.cancelled")'
      );
    }

    const { data: dispatches, error } = await q.limit(batchLimit);
    if (error) throw error;

    const knownCns = new Set((dispatches || []).map((d: any) => d.consignment_id));

    // 2. Also capture any orders from the last N days (or all) that have a consignment_id but no dispatch row
    let extraOrdersQuery = supabase
      .from("orders")
      .select("id, shopify_order_name, shopify_order_id, shopify_fulfillment_id, pathao_consignment_id, pathao_delivery_status, internal_status, total_price, customer_phone, customer_name, created_at")
      .not("pathao_consignment_id", "is", null);

    if (!isAll) {
      extraOrdersQuery = extraOrdersQuery.gte("created_at", daysAgo);
    }

    if (!isForce) {
      extraOrdersQuery = extraOrdersQuery.not("internal_status", "in", '("delivered","returned","cancelled")');
    }

    const { data: extraOrders } = await extraOrdersQuery.limit(isAll ? 300 : 100);
    const extraList = (extraOrders || [])
      .filter((o: any) => o.pathao_consignment_id && !knownCns.has(o.pathao_consignment_id))
      .map((o: any) => ({
        id: null,
        consignment_id: o.pathao_consignment_id,
        pathao_order_status: o.pathao_delivery_status || "Pending",
        amount_to_collect: Number(o.total_price || 0),
        delivery_fee: 0,
        recipient_phone: o.customer_phone,
        recipient_name: o.customer_name,
        shopify_order_name: o.shopify_order_name,
        orders: o,
      }));

    const activeList = [...(dispatches || []), ...extraList];

    let updatedCount = 0;
    const errors: any[] = [];
    const updatedDetails: any[] = [];

    // Check settings for SMS triggers
    const { data: settings } = await supabase.from("app_settings").select("*").single();
    const smsEnabled = !!settings?.sms_api_key;

    // Process in chunks of 3 parallel requests with smooth delay to avoid rate limits
    const CHUNK_SIZE = 3;
    for (let i = 0; i < activeList.length; i += CHUNK_SIZE) {
      const chunk = activeList.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (d: any) => {
          if (!d.consignment_id) return;

          try {
            const infoRes = await getPathaoOrderStatus(d.consignment_id);
            const data = infoRes?.data;
            if (!data || !data.order_status) return;

            const currentStatus = (d.pathao_order_status || "").toLowerCase().trim();
            const newStatus = (data.order_status || "").toLowerCase().trim();

            if (currentStatus === newStatus) return;

            // STRICT SYSTEM POLICY: Ignore partial delivery completely
            if (newStatus.includes("partial")) {
              console.log(`[Pathao Sync] Skipping partial delivery status '${data.order_status}' for consignment ${d.consignment_id}`);
              return;
            }

            const now = new Date().toISOString();
            const orderId = (d.orders as any)?.id;
            const shopifyOrderId = (d.orders as any)?.shopify_order_id;
            const shopifyFulfillmentId = (d.orders as any)?.shopify_fulfillment_id;

            // 1. Delivered
            if (newStatus.includes("delivered") || newStatus.includes("payment_received") || newStatus.includes("payment invoice")) {
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
                } catch (shopifySyncErr) {
                  console.error("[Sync] Failed to mark order delivered on Shopify:", shopifySyncErr);
                }
              }
              updatedCount++;
              updatedDetails.push({ consignment_id: d.consignment_id, order: d.shopify_order_name, oldStatus: currentStatus, newStatus: "Delivered" });
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
                // Update Pathao courier delivery status ONLY.
                // Return records and internal_status='returned' must only be driven by Shopify return webhooks.
                await supabase.from("orders").update({
                  pathao_delivery_status: "Returned",
                }).eq("id", orderId);
              }
              updatedCount++;
              updatedDetails.push({ consignment_id: d.consignment_id, order: d.shopify_order_name, oldStatus: currentStatus, newStatus: "Returned (Courier)" });
            }
            // 3. Out for Delivery / Assigned for Delivery
            else if (newStatus.includes("out_for_delivery") || newStatus.includes("out for delivery") || newStatus.includes("assigned for delivery") || newStatus.includes("assigned_for_delivery")) {
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
              updatedDetails.push({ consignment_id: d.consignment_id, order: d.shopify_order_name, oldStatus: currentStatus, newStatus: "Assigned for Delivery" });
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
              updatedDetails.push({ consignment_id: d.consignment_id, order: d.shopify_order_name, oldStatus: currentStatus, newStatus: "Cancelled" });
            }
            // 5. In Transit / Hub / other
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
                  internal_status: "dispatched",
                }).eq("id", orderId);
              }

              updatedCount++;
              updatedDetails.push({ consignment_id: d.consignment_id, order: d.shopify_order_name, oldStatus: currentStatus, newStatus: data.order_status });
            }
          } catch (err: any) {
            errors.push({ consignment_id: d.consignment_id, error: err.message });
          }
        })
      );
      if (i + CHUNK_SIZE < activeList.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    // Log the sync event to webhook_logs so the user has full visibility in Unified Logs
    if (updatedCount > 0 || errors.length > 0) {
      await supabase.from("webhook_logs").insert({
        source: "pathao",
        topic: "courier_sync",
        pathao_consignment_id: null,
        payload: {
          scannedDays: days,
          totalChecked: activeList.length,
          updatedCount,
          errorsCount: errors.length,
          sampleUpdates: updatedDetails.slice(0, 15),
          errors: errors.slice(0, 5),
        },
        processed: true,
        error: errors.length > 0 ? `${errors.length} parcels failed during sync` : null,
      });
    }

    return NextResponse.json({
      success: true,
      scannedDays: isAll ? "all" : days,
      totalChecked: activeList.length,
      checked: activeList.length,
      updatedCount,
      updated: updatedCount,
      errorsCount: errors.length,
      updatedDetails: updatedDetails.slice(0, 25),
    });
  } catch (err: any) {
    console.error("Pathao sync status error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
