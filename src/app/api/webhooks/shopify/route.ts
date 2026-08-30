import { type NextRequest, NextResponse } from "next/server";
import { verifyShopifyWebhook } from "@/lib/shopify/client";
import { createServiceClient } from "@/lib/supabase/server";
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

  // Process asynchronously (return 200 fast, process in background)
  processShopifyWebhook(topic, payload).catch(console.error);

  return NextResponse.json({ received: true }, { status: 200 });
}

async function processShopifyWebhook(
  topic: string,
  payload: ShopifyOrderWebhookPayload
) {
  const supabase = createServiceClient();

  try {
    switch (topic) {
      case "orders/create":
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

async function upsertOrder(supabase: any, payload: ShopifyOrderWebhookPayload) {
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

  await supabase.from("orders").upsert(
    {
      shopify_order_id: payload.id,
      shopify_order_name: payload.name,
      shopify_order_number: payload.order_number,
      customer_id: customerId,
      customer_shopify_id: payload.customer?.id || null,
      customer_name:
        shippingAddr?.name ||
        (payload.customer
          ? `${payload.customer.first_name} ${payload.customer.last_name}`.trim()
          : "Unknown"),
      customer_phone:
        shippingAddr?.phone || payload.customer?.phone || payload.phone || null,
      customer_email: payload.email,
      shipping_address: shippingAddr || null,
      line_items: lineItems,
      total_price: parseFloat(payload.total_price || "0"),
      subtotal_price: parseFloat(payload.subtotal_price || "0"),
      total_tax: parseFloat(payload.total_tax || "0"),
      currency: payload.currency || "BDT",
      financial_status: payload.financial_status,
      fulfillment_status: payload.fulfillment_status || null,
      shopify_tags: payload.tags ? payload.tags.split(",").map((t) => t.trim()) : [],
      note: payload.note || null,
      shopify_created_at: payload.created_at,
      shopify_updated_at: payload.updated_at,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "shopify_order_id" }
  );
}
