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
  const effectiveOrderId = payload.id || (payload as any).order_id;
  await supabase.from("webhook_logs").insert({
    source: "shopify",
    topic,
    shopify_order_id: effectiveOrderId,
    payload: payload as any,
    processed: false,
  });

  // Ignore test webhook
  if (effectiveOrderId === 123456) {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  // Ignore any order created before Sept 1st (BD Time)
  const minCreatedAt = new Date("2026-08-31T18:00:00Z");
  if (payload.created_at && new Date(payload.created_at) < minCreatedAt) {
    console.log(`Ignoring webhook for old order ${effectiveOrderId}`);
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
import { handleShopifyRefundOrReturn, isShopifyExchange } from "@/lib/shopify-returns";

async function processShopifyWebhook(
  topic: string,
  payload: ShopifyOrderWebhookPayload
) {
  const supabase = createServiceClient();
  const effectiveOrderId = payload.id || (payload as any).order_id;

  try {
    switch (topic) {
      case "orders/create": {
        const isNew = await upsertOrder(supabase, payload, true);
        if (isNew) {
          await logOrderEvent(payload.id.toString(), "SYNCED", "Order imported from Shopify via webhook");
          
          await sendOrderConfirmationSMS(supabase, payload)
            .catch(e => console.error("Order SMS Error:", e));
        }
        break;
      }

      case "refunds/create": {
        if (effectiveOrderId) {
          const p = payload as any;
          const noteStr = (p.note || "").toLowerCase();
          if (p.cancelled_at || noteStr.includes("cancel")) {
            const { data: ord } = await supabase
              .from("orders")
              .update({
                internal_status: "cancelled",
                cancel_reason: p.cancel_reason || p.note || "Cancelled via Shopify",
                returned_at: null,
                return_reason: null,
              })
              .eq("shopify_order_id", effectiveOrderId)
              .select("id")
              .maybeSingle();

            if (ord) {
              await supabase.from("returns").delete().eq("order_id", ord.id);
            }
            break;
          }

          // Check if this refund is for an exchange (never treat exchanges as returns)
          if (isShopifyExchange({ payload, refundData: payload })) {
            console.log(`[Shopify Webhook] refunds/create: Exchange detected for order ${effectiveOrderId}. Skipping return creation.`);
            const { data: ord } = await supabase.from("orders").select("id, internal_status, fulfillment_status, pathao_consignment_id").eq("shopify_order_id", effectiveOrderId).maybeSingle();
            if (ord) {
              await supabase.from("returns").delete().eq("order_id", ord.id);
              if (ord.internal_status === "returned") {
                const restoredStatus = ord.fulfillment_status === "fulfilled" || ord.pathao_consignment_id ? "dispatched" : "pending";
                await supabase.from("orders").update({
                  internal_status: restoredStatus,
                  returned_at: null,
                  return_reason: null,
                }).eq("id", ord.id);
              }
            }
            break;
          }

          await handleShopifyRefundOrReturn({
            shopifyOrderId: effectiveOrderId,
            refundData: payload,
            topic,
          });
        }
        break;
      }

      case "returns/approve":
      case "returns/create":
      case "returns/close": {
        if (effectiveOrderId) {
          // Check if this return is an exchange (never treat exchanges as returns)
          if (isShopifyExchange({ payload, refundData: payload })) {
            console.log(`[Shopify Webhook] ${topic}: Exchange detected for order ${effectiveOrderId}. Skipping return creation.`);
            const { data: ord } = await supabase.from("orders").select("id, internal_status, fulfillment_status, pathao_consignment_id").eq("shopify_order_id", effectiveOrderId).maybeSingle();
            if (ord) {
              await supabase.from("returns").delete().eq("order_id", ord.id);
              if (ord.internal_status === "returned") {
                const restoredStatus = ord.fulfillment_status === "fulfilled" || ord.pathao_consignment_id ? "dispatched" : "pending";
                await supabase.from("orders").update({
                  internal_status: restoredStatus,
                  returned_at: null,
                  return_reason: null,
                }).eq("id", ord.id);
              }
            }
            break;
          }

          await handleShopifyRefundOrReturn({
            shopifyOrderId: effectiveOrderId,
            refundData: payload,
            topic,
          });
        }
        break;
      }

      case "orders/updated":
      case "orders/paid": {
        await upsertOrder(supabase, payload);

        const p = payload as any;
        // If the order is cancelled, ensure it stays cancelled and delete any return record
        if (p.cancelled_at) {
          const { data: ord } = await supabase
            .from("orders")
            .update({
              internal_status: "cancelled",
              cancel_reason: p.cancel_reason || "Cancelled via Shopify",
              returned_at: null,
              return_reason: null,
            })
            .eq("shopify_order_id", payload.id)
            .select("id")
            .maybeSingle();

          if (ord) {
            await supabase.from("returns").delete().eq("order_id", ord.id);
          }
          break;
        }

        // Check if this update represents a return/refund on Shopify
        if (
          p.financial_status === "refunded" ||
          p.financial_status === "partially_refunded" ||
          (Array.isArray(p.refunds) && p.refunds.length > 0)
        ) {
          if (isShopifyExchange({ payload: p, refundData: p })) {
            console.log(`[Shopify Webhook] orders/updated: Exchange detected for order ${payload.id}. Skipping return creation.`);
            const { data: ord } = await supabase.from("orders").select("id, internal_status, fulfillment_status, pathao_consignment_id").eq("shopify_order_id", payload.id).maybeSingle();
            if (ord) {
              await supabase.from("returns").delete().eq("order_id", ord.id);
              if (ord.internal_status === "returned") {
                const restoredStatus = ord.fulfillment_status === "fulfilled" || ord.pathao_consignment_id ? "dispatched" : "pending";
                await supabase.from("orders").update({
                  internal_status: restoredStatus,
                  returned_at: null,
                  return_reason: null,
                }).eq("id", ord.id);
              }
            }
          } else {
            await handleShopifyRefundOrReturn({
              shopifyOrderId: payload.id,
              refundData: payload,
              topic,
            });
          }
        }
        break;
      }

      case "orders/cancelled":
        await upsertOrder(supabase, payload);
        const { data: cancelledOrd } = await supabase
          .from("orders")
          .update({
            internal_status: "cancelled",
            cancel_reason: payload.cancel_reason || "Cancelled via Shopify",
            returned_at: null,
            return_reason: null,
          })
          .eq("shopify_order_id", payload.id)
          .select("id")
          .maybeSingle();
        
        if (cancelledOrd) {
          await supabase.from("returns").delete().eq("order_id", cancelledOrd.id);
          await supabase.from("dispatches").update({
            is_cancelled: true,
            cancelled_at: payload.cancelled_at || new Date().toISOString(),
            cancel_reason: payload.cancel_reason || "Cancelled via Shopify webhook",
          }).eq("order_id", cancelledOrd.id);
        }
        
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
      .eq("shopify_order_id", effectiveOrderId)
      .eq("source", "shopify");
  } catch (err: any) {
    console.error("[Shopify Webhook] Processing error:", err);
    await supabase
      .from("webhook_logs")
      .update({ error: err.message })
      .eq("shopify_order_id", effectiveOrderId)
      .eq("source", "shopify");
  }
}

async function upsertOrder(supabase: any, payload: ShopifyOrderWebhookPayload, isCreate = false): Promise<boolean> {
  // Check if it already exists to detect new orders
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id, internal_status, pathao_consignment_id")
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
    
    // Fetch true fulfillment status via GraphQL only for non-create webhooks (e.g. updates)
    // On orders/create, status is newly created (unfulfilled). Never sleep or delay on webhook.
    if (!isCreate && trueFulfillmentStatus === null) {
      try {
        const { data: settings } = await supabase.from("app_settings").select("shopify_shop_domain, shopify_access_token").single();
        if (settings?.shopify_shop_domain && settings?.shopify_access_token) {
          const q = `{ order(id: "gid://shopify/Order/${payload.id}") { displayFulfillmentStatus, displayFinancialStatus, tags } }`;
          const res = await fetch(`https://${settings.shopify_shop_domain}/admin/api/2024-07/graphql.json`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": settings.shopify_access_token },
            body: JSON.stringify({ query: q })
          });
          const json = await res.json();
          if (json.data?.order?.displayFulfillmentStatus) {
            trueFulfillmentStatus = json.data.order.displayFulfillmentStatus.toLowerCase();
          }
        }
      } catch (err) {
        console.error("Failed to fetch true fulfillment status:", err);
      }
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
      total_price: parseFloat((payload as any).current_total_price || payload.total_price || "0"),
      subtotal_price: parseFloat((payload as any).current_subtotal_price || payload.subtotal_price || "0"),
      total_tax: parseFloat((payload as any).current_total_tax || payload.total_tax || "0"),
      currency: payload.currency || "BDT",
      financial_status: payload.financial_status,
      fulfillment_status: trueFulfillmentStatus,
      shopify_tags: payload.tags ? payload.tags.split(",").map((t: string) => t.trim()) : [],
      note: payload.note || null,
      shopify_created_at: payload.created_at,
      shopify_updated_at: payload.updated_at,
      synced_at: new Date().toISOString(),
    };

    const fs = (trueFulfillmentStatus || "").toLowerCase();
    const tagsList = payload.tags ? payload.tags.split(",").map((t: string) => t.trim().toLowerCase()) : [];
    const isShopifyHold = fs === "on_hold" || fs === "hold" || tagsList.some((t: string) => t === "hold" || t === "on hold");

    if (payload.cancelled_at) {
      orderPayload.internal_status = "cancelled";
      orderPayload.cancel_reason = payload.cancel_reason || "Cancelled via Shopify";
    } else if (isShopifyHold) {
      orderPayload.internal_status = "hold";
      orderPayload.fulfillment_status = "on_hold";
    } else if (
      !existingOrder ||
      (!["delivered", "returned", "cancelled"].includes(existingOrder.internal_status))
    ) {
      if (fs === "in_progress" || fs === "partial" || fs === "partially_fulfilled") {
        orderPayload.internal_status = "preparing";
      } else if (fs === "fulfilled") {
        orderPayload.internal_status = "dispatched";
      } else if (existingOrder?.internal_status === "hold" && !isShopifyHold) {
        // Hold was released in Shopify
        orderPayload.internal_status = existingOrder.pathao_consignment_id ? "dispatched" : "pending";
      } else if (isNew) {
        orderPayload.internal_status = "pending";
      }
    }

    // If order was marked on hold, update any active dispatches row as well
    if (isShopifyHold && existingOrder?.id) {
      await supabase
        .from("dispatches")
        .update({ pathao_order_status: "Hold", updated_at: new Date().toISOString() })
        .eq("order_id", existingOrder.id)
        .not("pathao_order_status", "in", '("Delivered","Returned","Return","Paid Return","Return Completed","Cancelled")');
    }

    // Save the order record immediately to lock it in Supabase so that any concurrent
    // webhook requests or retries immediately recognize that the order already exists (isNew = false)
    await supabase.from("orders").upsert(
      orderPayload,
      { onConflict: "shopify_order_id" }
    );

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
          const { analyzeCustomerRisk } = await import("@/lib/risk-analytics");
          const riskAnalysis = analyzeCustomerRisk(fraudRes);
          riskLevel = riskAnalysis.riskLevel;
          riskScore = riskAnalysis.riskScore;
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

        // 3. Return rate check against historical customer orders
        if (customerPhone) {
          const [{ count: totalCount }, { count: returnedCount }] = await Promise.all([
            supabase
              .from("orders")
              .select("id", { count: "exact" })
              .eq("customer_phone", customerPhone),
            supabase
              .from("orders")
              .select("id", { count: "exact" })
              .eq("customer_phone", customerPhone)
              .eq("internal_status", "returned")
          ]);
          
          const totalPast = totalCount || 0;
          const returnedPast = returnedCount || 0;
          const deliveredPast = Math.max(0, totalPast - returnedPast);

          if (totalPast > 0 && returnedPast > 0) {
            const { analyzeCustomerRisk } = await import("@/lib/risk-analytics");
            const internalRisk = analyzeCustomerRisk({
              total: totalPast,
              delivered: deliveredPast,
              returned: returnedPast,
            });
            riskScore += Math.round(internalRisk.riskScore * 0.7);
          }
        }

        riskScore = Math.min(riskScore, 100);
        if (riskScore >= 70) riskLevel = "fraud";
        else if (riskScore >= 35) riskLevel = "risky";
        else riskLevel = "safe";
      }

      // Update the order in database with fraud results
      await supabase.from("orders").update({
        fraud_score: riskScore,
        fraud_status: riskLevel,
        fraud_data: fraudData,
        fraud_risk_score: riskScore,
        fraud_risk_level: riskLevel,
      }).eq("shopify_order_id", payload.id);

      if (fraudData) {
        // Update Shopify Customer and Order notes
        const tag = `FraudSpy: ${riskLevel === 'fraud' ? 'High Risk' : riskLevel === 'risky' ? 'Medium Risk' : 'Safe'}`;

        const { updateShopifyCustomer, updateShopifyOrder } = await import("@/lib/shopify/client");
        const { buildFraudSpyCustomAttributes, buildFraudSpyCustomerNote } = await import("@/lib/fraud-checker");
        const { analyzeCustomerRisk } = await import("@/lib/risk-analytics");
        const riskAnalysis = analyzeCustomerRisk(fraudData);
        const customAttributes = buildFraudSpyCustomAttributes(fraudData, riskAnalysis);
        const customerNote = buildFraudSpyCustomerNote(fraudData, riskAnalysis);
        
        if (orderPayload.customer_shopify_id) {
          try {
            const { data: customerData } = await supabase.from("customers").select("shopify_tags").eq("shopify_customer_id", orderPayload.customer_shopify_id).single();
            const existingTags = customerData?.shopify_tags || [];
            const mergedTags = Array.from(new Set([...existingTags, tag, 'FraudSpy Verified']));

            await updateShopifyCustomer({
              id: `gid://shopify/Customer/${orderPayload.customer_shopify_id}`,
              tags: mergedTags,
              note: customerNote,
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
              customAttributes: customAttributes,
            });
          } catch (e) {
            console.error("Failed to update Shopify order during webhook:", e);
          }
        }
      }
    }
  }

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
        
      await sendSMS(phone, msg, false, `order_confirmation_${payload.id}`, {
        orderId: payload.id,
        orderName: payload.name || `#${payload.order_number || payload.id}`,
        customerName: shippingAddr?.name || payload.customer?.first_name || "Customer",
        eventType: "order",
      });
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
        
      await sendSMS(phone, msg, false, `order_cancelled_${payload.id}`, {
        orderId: payload.id,
        orderName: payload.name || `#${payload.order_number || payload.id}`,
        customerName: shippingAddr?.name || payload.customer?.first_name || "Customer",
        eventType: "cancelled",
      });
    }
  }
}
