import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { updateShopifyFulfillmentTracking, addShopifyOrderTags } from "@/lib/shopify/client";

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

  // Await the processing to ensure it completes before the serverless function terminates
  try {
    await processPathaoWebhook(payload, returnSecret);
  } catch (err) {
    console.error("Pathao Webhook processing error:", err);
  }

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
  const merchantOrderId = payload.merchant_order_id;

  if (!consignmentId) return;

  try {
    const newEvent = payload.event;
    
    // 1. Try to find the order directly first (more reliable)
    let order: any = null;
    if (merchantOrderId) {
      const { data } = await supabase.from("orders").select("*, customers(name, phone)").eq("shopify_order_name", merchantOrderId).maybeSingle();
      if (data) order = data;
    }
    
    if (!order) {
      const { data } = await supabase.from("orders").select("*, customers(name, phone)").eq("pathao_consignment_id", consignmentId).maybeSingle();
      if (data) order = data;
    }

    // 2. Update dispatch record if it exists
    const { data: dispatch } = await supabase
      .from("dispatches")
      .select("*")
      .eq("consignment_id", consignmentId)
      .maybeSingle();

    if (dispatch) {
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
        
      if (!order && dispatch.order_id) {
         const { data: orderFromDispatch } = await supabase.from("orders").select("*, customers(name, phone)").eq("id", dispatch.order_id).maybeSingle();
         if (orderFromDispatch) order = orderFromDispatch;
      }
    }

    if (!order) {
      console.warn(`[Pathao Webhook] No order found for consignment ${consignmentId} or merchant ID ${merchantOrderId}`);
    } else {
      // Map Pathao event to internal ERP status
      const internalStatus = mapPathaoEventToInternal(newEvent);
      
      // Determine if Shopify tags should be added
      const tagsToAdd: string[] = [];
      if (internalStatus === "returned") tagsToAdd.push("Pathao: Returned");
      else if (internalStatus === "hold") tagsToAdd.push("Pathao: Hold");
      else if (internalStatus === "partial") tagsToAdd.push("Pathao: Partial Delivery");

      // Update order internal status
      await supabase
        .from("orders")
        .update({
          pathao_delivery_status: newEvent,
          internal_status: internalStatus,
        })
        .eq("id", order.id);

      // Add Shopify Tags if needed
      if (tagsToAdd.length > 0 && order.shopify_order_id) {
        try {
          // Convert shopify_order_id to gid
          const gid = `gid://shopify/Order/${order.shopify_order_id}`;
          await addShopifyOrderTags(gid, tagsToAdd);
        } catch (tagErr) {
          console.error("[Pathao Webhook] Shopify tag update failed:", tagErr);
        }
      }

      // Update Shopify fulfillment tracking if order has fulfillment
      if (order.shopify_fulfillment_id) {
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

      // Handle automated SMS
      try {
        if (internalStatus === "dispatched" || internalStatus === "delivered") {
          const { data: settings } = await supabase.from("app_settings").select("*").single();
          if (settings?.sms_api_key) {
            const phone = order?.customer_phone || order?.customers?.phone;
            if (phone) {
              const { sendSMS } = await import("@/lib/sms");
              let template = null;
              
              if (internalStatus === "dispatched" && settings.sms_auto_dispatch_enabled) {
                template = settings.sms_auto_dispatch_template;
              } else if (internalStatus === "delivered" && settings.sms_auto_delivered_enabled) {
                template = settings.sms_auto_delivered_template;
              }

              if (template) {
                let msg = template
                  .replace("{{order_id}}", order.shopify_order_name || order.id)
                  .replace("{{customer_name}}", order.customers?.name || "Customer")
                  .replace("{{tracking_url}}", `https://merchant.pathao.com/cn-tracking/${consignmentId}`)
                  .replace("{{total_price}}", order.total_price !== undefined && order.total_price !== null ? order.total_price.toString() : "0");

                await sendSMS(phone, msg);
              }
            }
          }
        }
      } catch (smsError) {
        console.error("[SMS Automation Error]", smsError);
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
  if (event.includes("partial-delivery")) {
    return "partial";
  }
  if (event.includes("delivered")) {
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
