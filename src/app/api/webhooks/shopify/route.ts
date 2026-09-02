import { type NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/client";
import { createServiceClient } from "@/lib/supabase/server";
import { logOrderEvent } from "@/lib/audit";
import type { ShopifyOrderWebhookPayload } from "@/types/database";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256") || "";
  const topic = request.headers.get("x-shopify-topic") || "";

  // Verify webhook authenticity
  if (!verifyShopifyWebhook(rawBody, hmac)) {
    console.error("[Shopify Webhook] Invalid HMAC signature");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  let payload: ShopifyOrderWebhookPayload;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Log the webhook
  await supabase.from("webhook_logs").insert({
    source: "shopify",
    topic,
    shopify_order_id: payload.id,
    payload: payload as any,
    processed: false,
  });

  // Ignore test webhook
  if (payload.id === 123456) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Ignore any order created before Sept 1st (BD Time)
  const minCreatedAt = new Date("2026-08-31T18:00:00Z");
  if (payload.created_at && new Date(payload.created_at) < minCreatedAt) {
    console.log(`Ignoring webhook for old order ${payload.id}`);
    return NextResponse.json({ received: true, ignored: true }, { status: 200 });
  }

  // Await the processing to ensure it completes before the serverless function terminates
  try {
    await processShopifyWebhook(topic, payload);
  } catch (err) {
    console.error("Webhook processing error:", err);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

import { performFraudCheck } from "@/lib/fraud-checker";

async function processShopifyWebhook(
  topic: string,
  payload: ShopifyOrderWebhookPayload
) {
  const supabase = createServiceClient();

  try {
    switch (topic) {
      case "orders/create": {
        const isNew = await upsertOrder(supabase, payload);
        if (isNew) {
          await logOrderEvent(payload.id.toString(), "SYNCED", "Order imported from Shopify via webhook");
          
          // Await background tasks so they don't get terminated by serverless environment
          await Promise.allSettled([
            performFraudCheck(payload.id.toString(), supabase)
              .then(res => console.log(`Auto fraud check for ${payload.id}: ${res.fraud_status}`))
              .catch(e => console.error(`Auto fraud check failed for ${payload.id}:`, e)),
            sendOrderConfirmationSMS(supabase, payload)
              .catch(e => console.error("Order SMS Error:", e))
          ]);
        }
        break;
      }

      case "orders/updated":
      case "orders/paid":
        await upsertOrder(supabase, payload);
        break;

      case "orders/cancelled":
        await upsertOrder(supabase, payload);
        await supabase
          .from("orders")
          .update({
            internal_status: "cancelled",
            cancel_reason: payload.cancel_reason || "Cancelled via Shopify",
          })
          .eq("shopify_order_id", payload.id);
        
        // Await the SMS so it doesn't get cancelled by serverless termination
        await sendOrderCancelledSMS(supabase, payload).catch(e => console.error("Order Cancelled SMS Error:", e));
        break;

      case "orders/fulfilled":
        await upsertOrder(supabase, payload);
        break;

      default:
        console.log(`[Shopify Webhook] Unhandled topic: ${topic}`);
    }

    // Mark as processed
    await supabase
      .from("webhook_logs")
      .update({ processed: true })
      .eq("shopify_order_id", payload.id)
      .eq("source", "shopify");
  } catch (err: any) {
    console.error("[Shopify Webhook] Processing error:", err);
    await supabase
      .from("webhook_logs")
      .update({ error: err.message })
      .eq("shopify_order_id", payload.id)
      .eq("source", "shopify");
  }
}

async function upsertOrder(supabase: any, payload: ShopifyOrderWebhookPayload): Promise<boolean> {
  // Check if it already exists to detect new orders
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("shopify_order_id", payload.id)
    .maybeSingle();

  const isNew = !existingOrder;

  // Upsert customer first
  let customerId: string | null = null;
  if (payload.customer) {
    const c = payload.customer;
    const { data: customer } = await supabase
      .from("customers")
      .upsert(
        {
          shopify_customer_id: c.id,
          name: `${c.first_name} ${c.last_name}`.trim(),
          email: c.email,
          phone: c.phone,
          total_orders: c.orders_count,
          total_spent: parseFloat(c.total_spent || "0"),
          synced_at: new Date().toISOString(),
        },
        { onConflict: "shopify_customer_id" }
      )
      .select("id")
      .single();
    customerId = customer?.id || null;
  }

  const shippingAddr = payload.shipping_address;

  // Build line items
  const lineItems = payload.line_items.map((item) => ({
    title: item.title,
    quantity: item.quantity,
    price: parseFloat(item.price),
    sku: item.sku,
    variant_title: item.variant_title,
    grams: item.grams,
  }));

  const customerPhone = shippingAddr?.phone || payload.customer?.phone || payload.phone || null;
  const customerEmail = payload.email;
  const customerName = shippingAddr?.name ||
    (payload.customer
      ? `${payload.customer.first_name} ${payload.customer.last_name}`.trim()
      : "Unknown");

    let trueFulfillmentStatus = payload.fulfillment_status || null;
    
    // Fetch true fulfillment status via GraphQL to handle 'In progress' which is null in REST
    try {
      if (trueFulfillmentStatus === null) {
        // Add a 4 second delay to allow Shopify's read replicas to catch up. 
        await new Promise(resolve => setTimeout(resolve, 4000));
      }

      const { data: settings } = await supabase.from("app_settings").select("shopify_shop_domain, shopify_access_token").single();
      if (settings?.shopify_shop_domain && settings?.shopify_access_token) {
        const q = `{ order(id: "gid://shopify/Order/${payload.id}") { displayFulfillmentStatus, fulfillmentOrders(first: 10) { edges { node { status } } } } }`;
        const res = await fetch(`https://${settings.shopify_shop_domain}/admin/api/2024-07/graphql.json`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": settings.shopify_access_token },
          body: JSON.stringify({ query: q })
        });
        const json = await res.json();
        if (json.data?.order) {
          if (json.data.order.displayFulfillmentStatus) {
            trueFulfillmentStatus = json.data.order.displayFulfillmentStatus.toLowerCase();
          }
          
          // Fallback: Check underlying fulfillment orders for immediate status changes
          const foEdges = json.data.order.fulfillmentOrders?.edges || [];
          const hasInProgress = foEdges.some((e: any) => e.node.status === "IN_PROGRESS");
          const hasOnHold = foEdges.some((e: any) => e.node.status === "ON_HOLD");
          
          if (hasOnHold) {
            trueFulfillmentStatus = "on_hold";
          } else if (hasInProgress) {
            trueFulfillmentStatus = "in_progress";
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch true fulfillment status:", err);
    }

    const orderPayload: any = {
      shopify_order_id: payload.id,
      shopify_order_name: payload.name,
      shopify_order_number: payload.order_number,
      customer_id: customerId,
      customer_shopify_id: payload.customer?.id || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
      shipping_address: shippingAddr || null,
      line_items: lineItems,
      total_price: parseFloat(payload.total_price || "0"),
      subtotal_price: parseFloat(payload.subtotal_price || "0"),
      total_tax: parseFloat(payload.total_tax || "0"),
      currency: payload.currency || "BDT",
      financial_status: payload.financial_status,
      fulfillment_status: trueFulfillmentStatus,
    shopify_tags: payload.tags ? payload.tags.split(",").map((t) => t.trim()) : [],
    note: payload.note || null,
    shopify_created_at: payload.created_at,
    shopify_updated_at: payload.updated_at,
    synced_at: new Date().toISOString(),
  };

  if (payload.cancelled_at) {
    orderPayload.internal_status = "cancelled";
    orderPayload.cancel_reason = payload.cancel_reason || "Cancelled via Shopify";
  }

  // Perform fraud check if this is a new order
  if (isNew) {
    const { data: settings } = await supabase.from("app_settings").select("fraud_check_enabled, fraudspy_api_key").single();
    
    if (settings?.fraud_check_enabled) {
      let riskScore = 0;
      let riskLevel = 'safe';
      let fraudData = null;

      if (settings.fraudspy_api_key && customerPhone) {
        // Use FraudSpy API
        const { searchFraud } = await import("@/lib/fraudspy");
        const fraudRes = await searchFraud(customerPhone, settings.fraudspy_api_key);
        
        if (fraudRes && fraudRes.ok) {
          fraudData = fraudRes;
          
          if (fraudRes.fraud_reports?.count > 0) {
            riskLevel = "fraud";
            riskScore = 100;
          } else if (fraudRes.overall?.success_ratio < 60 && fraudRes.overall?.total > 3) {
            riskLevel = "risky";
            riskScore = 80;
          } else if (fraudRes.overall?.success_ratio < 80 && fraudRes.overall?.total > 5) {
            riskLevel = "risky";
            riskScore = 50;
          } else {
            riskLevel = "safe";
            riskScore = 0;
          }
        }
      } else {
        // Internal heuristic if no API key provided
        // 1. Phone number validation (BD numbers)
        const cleanPhone = customerPhone?.replace(/\D/g, '') || "";
        if (!cleanPhone.startsWith("880") && !cleanPhone.startsWith("01")) {
          riskScore += 30; // Suspicious phone number format
        } else if (cleanPhone.length < 11) {
          riskScore += 40; // Too short
        }
        
        // 2. High order value COD
        if (orderPayload.total_price > 10000 && orderPayload.financial_status === "pending") {
          riskScore += 20; // High value COD
        }

        // 3. Serial Returner Check
        if (customerPhone) {
          const { count: returnedCount } = await supabase
            .from("orders")
            .select("id", { count: "exact" })
            .eq("customer_phone", customerPhone)
            .eq("internal_status", "returned");
          
          if (returnedCount && returnedCount > 0) {
            riskScore += (returnedCount * 30); // 30 points per returned order
          }
        }

        riskScore = Math.min(riskScore, 100);
        if (riskScore >= 70) riskLevel = "fraud";
        else if (riskScore >= 30) riskLevel = "risky";
        else riskLevel = "safe";
      }

      orderPayload.fraud_score = riskScore;
      orderPayload.fraud_status = riskLevel;
      if (fraudData) {
        orderPayload.fraud_data = fraudData;

        // Update Shopify Customer and Order notes
        const tag = `FraudSpy: ${riskLevel === 'fraud' ? 'High Risk' : riskLevel === 'risky' ? 'Medium Risk' : 'Safe'}`;

        const { updateShopifyCustomer, updateShopifyOrder } = await import("@/lib/shopify/client");
        
        if (orderPayload.customer_shopify_id) {
          try {
            const { data: customerData } = await supabase.from("customers").select("shopify_tags").eq("shopify_customer_id", orderPayload.customer_shopify_id).single();
            const existingTags = customerData?.shopify_tags || [];
            const mergedTags = Array.from(new Set([...existingTags, tag, 'FraudSpy Verified']));

            await updateShopifyCustomer({
              id: `gid://shopify/Customer/${orderPayload.customer_shopify_id}`,
              tags: mergedTags
            });
          } catch (e) {
            console.error("Failed to update Shopify customer during webhook:", e);
          }
        }

        if (orderPayload.shopify_order_id) {
          try {
            await updateShopifyOrder({
              id: `gid://shopify/Order/${orderPayload.shopify_order_id}`,
              tags: [tag, 'FraudSpy Verified'],
              customAttributes: [
                { key: "FraudSpy Status", value: riskLevel.toUpperCase() },
                { key: "FraudSpy Score", value: riskScore.toString() },
                { key: "FraudSpy Delivered", value: (fraudData.overall?.delivered || 0).toString() },
                { key: "FraudSpy Returned", value: (fraudData.overall?.returned || 0).toString() },
                { key: "FraudSpy Success Ratio", value: `${fraudData.overall?.success_ratio || 0}%` },
                { key: "FraudSpy Last Checked", value: new Date().toLocaleString() }
              ]
            });
          } catch (e) {
            console.error("Failed to update Shopify order during webhook:", e);
          }
        }
      }
    }
  }

  await supabase.from("orders").upsert(
    orderPayload,
    { onConflict: "shopify_order_id" }
  );

  return isNew;
}

async function sendOrderConfirmationSMS(supabase: any, payload: ShopifyOrderWebhookPayload) {
  const { data: settings } = await supabase.from("app_settings").select("*").single();
  if (settings?.sms_api_key && settings.sms_auto_order_enabled && settings.sms_auto_order_template) {
    const shippingAddr = payload.shipping_address;
    const phone = shippingAddr?.phone || payload.customer?.phone || payload.phone;
    
    if (phone) {
      const { sendSMS } = await import("@/lib/sms");
      let msg = settings.sms_auto_order_template
        .replace("{{order_id}}", payload.name || payload.id.toString())
        .replace("{{customer_name}}", shippingAddr?.name || payload.customer?.first_name || "Customer");
        
      await sendSMS(phone, msg);
    }
  }
}

async function sendOrderCancelledSMS(supabase: any, payload: ShopifyOrderWebhookPayload) {
  const { data: settings } = await supabase.from("app_settings").select("*").single();
  if (settings?.sms_api_key && settings.sms_auto_cancelled_enabled && settings.sms_auto_cancelled_template) {
    const shippingAddr = payload.shipping_address;
    const phone = shippingAddr?.phone || payload.customer?.phone || payload.phone;
    
    if (phone) {
      const { sendSMS } = await import("@/lib/sms");
      let msg = settings.sms_auto_cancelled_template
        .replace("{{order_id}}", payload.name || payload.id.toString())
        .replace("{{customer_name}}", shippingAddr?.name || payload.customer?.first_name || "Customer");
        
      await sendSMS(phone, msg);
    }
  }
}
