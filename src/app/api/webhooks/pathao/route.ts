import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { updateShopifyFulfillmentTracking } from "@/lib/shopify/client";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabaseAdmin = createServiceClient();

  const providedSecret = request.headers.get("x-pathao-merchant-webhook-integration-secret") || "";

  // Fetch the stored secret from app_settings
  const { data: settings } = await supabaseAdmin.from("app_settings").select("pathao_webhook_secret").single();
  const storedSecret = settings?.pathao_webhook_secret;

  // The secret we will return in headers
  const returnSecret = storedSecret || providedSecret || "f3992ecc-59da-4cbe-a049-a13da2018d51";

  // 1. Webhook Integration Verification Event
  if (payload.event === "webhook_integration") {
    return new NextResponse(JSON.stringify({ success: true }), {
      status: 202,
      headers: {
        "Content-Type": "application/json",
        "X-Pathao-Merchant-Webhook-Integration-Secret": returnSecret
      }
    });
  }

  // 2. Secret Verification for normal events
  if (storedSecret && !providedSecret.includes(storedSecret)) {
    console.error(`[Pathao Webhook] Unauthorized. Expected: ${storedSecret}, Got: ${providedSecret}`);
    // Still return the header even on failure so Pathao UI shows what failed
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "X-Pathao-Merchant-Webhook-Integration-Secret": returnSecret
      }
    });
  }

  // Log incoming webhook
  await supabaseAdmin.from("webhook_logs").insert({
    source: "pathao",
    topic: payload.event || "status_update",
    pathao_consignment_id: payload.consignment_id,
    payload,
    processed: false,
  });

  // Process async
  processPathaoWebhook(payload, returnSecret).catch(console.error);

  // Pathao expects 202 with the header for all valid events
  return new NextResponse(JSON.stringify({ received: true }), {
    status: 202,
    headers: {
      "Content-Type": "application/json",
      "X-Pathao-Merchant-Webhook-Integration-Secret": returnSecret
    }
  });
}

async function processPathaoWebhook(payload: any, storedSecret: string) {
  const supabase = createServiceClient();
  const consignmentId = payload.consignment_id;

  if (!consignmentId) return;

  try {
    const newEvent = payload.event;

    // Update dispatch record
    const { data: dispatch } = await supabase
      .from("dispatches")
      .select("*, orders(*)")
      .eq("consignment_id", consignmentId)
      .single();

    if (!dispatch) {
      console.warn(`[Pathao Webhook] No dispatch found for ${consignmentId}`);
      return;
    }

    // Append to tracking history
    const history = (dispatch.tracking_history as any[]) || [];
    history.push({
      status: newEvent,
      timestamp: payload.updated_at || new Date().toISOString(),
      note: payload.reason || null,
    });

    await supabase
      .from("dispatches")
      .update({
        pathao_order_status: newEvent,
        tracking_history: history,
      })
      .eq("consignment_id", consignmentId);

    // Map Pathao event to internal ERP status
    const internalStatus = mapPathaoEventToInternal(newEvent);

    // Update order internal status
    await supabase
      .from("orders")
      .update({
        pathao_delivery_status: newEvent,
        internal_status: internalStatus,
      })
      .eq("id", dispatch.order_id);

    // Update Shopify fulfillment tracking if order has fulfillment
    const order = dispatch.orders as any;
    if (order?.shopify_fulfillment_id) {
      try {
        await updateShopifyFulfillmentTracking({
          fulfillmentId: order.shopify_fulfillment_id,
          trackingNumber: consignmentId,
          trackingCompany: "Pathao",
          trackingUrl: `https://merchant.pathao.com/cn-tracking/${consignmentId}`,
          notifyCustomer: newEvent === "order.delivered" || newEvent === "order.partial-delivery",
        });
      } catch (shopifyErr) {
        console.error("[Pathao Webhook] Shopify tracking update failed:", shopifyErr);
      }
    }

    // Mark webhook as processed
    await supabase
      .from("webhook_logs")
      .update({ processed: true })
      .eq("pathao_consignment_id", consignmentId)
      .eq("source", "pathao");
  } catch (err: any) {
    console.error("[Pathao Webhook] Error:", err);
    await supabase
      .from("webhook_logs")
      .update({ error: err.message })
      .eq("pathao_consignment_id", consignmentId)
      .eq("source", "pathao");
  }
}

function mapPathaoEventToInternal(event: string): string {
  if (event.includes("delivered") || event.includes("partial-delivery")) {
    return "delivered";
  }
  if (event.includes("return")) {
    return "returned";
  }
  if (event.includes("hold") || event.includes("failed") || event.includes("cancelled")) {
    return "hold";
  }
  if (event.includes("pick") || event.includes("transit") || event.includes("hub") || event.includes("assigned")) {
    return "dispatched";
  }
  return "dispatched";
}
