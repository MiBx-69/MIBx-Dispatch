import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { updateShopifyFulfillmentTracking } from "@/lib/shopify/client";

// Pathao webhook delivers order status updates
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Log incoming webhook
  await supabase.from("webhook_logs").insert({
    source: "pathao",
    topic: payload.order_status || "status_update",
    pathao_consignment_id: payload.consignment_id,
    payload,
    processed: false,
  });

  // Process async
  processPathaoWebhook(payload).catch(console.error);

  return NextResponse.json({ received: true }, { status: 200 });
}

async function processPathaoWebhook(payload: any) {
  const supabase = createServiceClient();
  const consignmentId = payload.consignment_id;

  if (!consignmentId) return;

  try {
    const newStatus = payload.order_status || payload.status;

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
      status: newStatus,
      timestamp: payload.updated_at || new Date().toISOString(),
      note: payload.note || null,
    });

    await supabase
      .from("dispatches")
      .update({
        pathao_order_status: newStatus,
        tracking_history: history,
      })
      .eq("consignment_id", consignmentId);

    // Map Pathao status to internal ERP status
    const internalStatus = mapPathaoStatusToInternal(newStatus);

    // Update order internal status
    await supabase
      .from("orders")
      .update({
        pathao_delivery_status: newStatus,
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
          notifyCustomer: newStatus === "Delivered",
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

function mapPathaoStatusToInternal(pathaoStatus: string): string {
  const map: Record<string, string> = {
    Pending: "dispatched",
    "Picked Up": "dispatched",
    "In Transit": "dispatched",
    "Out for Delivery": "dispatched",
    Delivered: "delivered",
    Return: "returned",
    "Return In Transit": "returned",
    "Return Arrived": "returned",
    "Return Completed": "returned",
    "Partial Delivered": "delivered",
    Hold: "delayed",
    Delayed: "delayed",
    Cancelled: "cancelled",
  };
  return map[pathaoStatus] || "dispatched";
}
