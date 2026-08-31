import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShopifyOrders } from "@/lib/shopify/client";
import { deleteCachePattern } from "@/lib/redis";

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const url = new URL(request.url);
  const fullSync = url.searchParams.get("fullSync") === "true";

  // Only admins can trigger sync
  const { data: { user } } = await (await import("@/lib/supabase/server")).createClient().then(c => c.auth.getUser()).catch(() => ({ data: { user: null } }));

  // Insert sync log
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({
      sync_type: fullSync ? "full_shopify" : "delta_shopify",
      status: "running",
      orders_synced: 0,
      customers_synced: 0,
      errors: 0,
    })
    .select()
    .single();

  const logId = syncLog?.id;

  // Wait for sync to complete (Vercel kills unawaited promises)
  await runShopifySync(supabase, logId, fullSync).catch(console.error);

  return NextResponse.json({
    message: "Sync completed",
    sync_log_id: logId,
  });
}

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const { data: logs } = await supabase
    .from("sync_logs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(10);
  return NextResponse.json({ logs });
}

async function runShopifySync(supabase: any, logId?: string, fullSync = false) {
  let ordersCount = 0;
  let customersCount = 0;
  let errors = 0;
  let cursor: string | undefined;

  let query: string | undefined = undefined;

  if (!fullSync) {
    const { data: latestOrder } = await supabase
      .from('orders')
      .select('shopify_updated_at')
      .order('shopify_updated_at', { ascending: false })
      .limit(1)
      .single();

    if (latestOrder?.shopify_updated_at) {
      query = `updated_at:>'${latestOrder.shopify_updated_at}'`;
    }
  }

  try {
    const { data: settings } = await supabase
      .from("app_settings")
      .select("fraud_check_enabled, fraudspy_api_key, sms_auto_order_enabled, sms_auto_order_template")
      .single();

    // Paginate through Shopify orders
    do {
      const result = await getShopifyOrders({
        first: 250,
        after: cursor,
        query
      });

      const orders = result.edges.map((e: any) => e.node);

      // Process in chunks of 10 to avoid rate limits while being fast
      const chunkSize = 10;
      for (let i = 0; i < orders.length; i += chunkSize) {
        const chunk = orders.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (shopifyOrder: any) => {
            try {
              await upsertShopifyOrder(supabase, shopifyOrder, fullSync, settings);
              ordersCount++;

              if (shopifyOrder.customer) {
                await upsertShopifyCustomer(supabase, shopifyOrder.customer);
                customersCount++;
              }
            } catch (err) {
              console.error(`[Sync] Error for order ${shopifyOrder.name}:`, err);
              errors++;
            }
          })
        );
      }

      cursor = result.pageInfo.hasNextPage ? result.pageInfo.endCursor : undefined;
    } while (cursor);

    // Clear relevant caches
    await deleteCachePattern("shopify:orders:*");
    await deleteCachePattern("dashboard:stats");

    // Update sync log as completed
    if (logId) {
      await supabase
        .from("sync_logs")
        .update({
          status: "completed",
          orders_synced: ordersCount,
          customers_synced: customersCount,
          errors,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }

    console.log(`[Sync] Completed: ${ordersCount} orders, ${customersCount} customers, ${errors} errors`);
  } catch (err: any) {
    console.error("[Sync] Fatal error:", err);
    if (logId) {
      await supabase
        .from("sync_logs")
        .update({
          status: "failed",
          error_details: err.message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
  }
}

async function upsertShopifyOrder(supabase: any, shopifyOrder: any, isFullSync: boolean = false, settings: any = null) {
  const shippingAddr = shopifyOrder.shippingAddress;
  const customer = shopifyOrder.customer;

  const lineItems = shopifyOrder.lineItems.edges.map((e: any) => ({
    title: e.node.title,
    quantity: e.node.quantity,
    price: parseFloat(e.node.originalUnitPriceSet?.shopMoney?.amount || "0"),
    sku: e.node.sku || e.node.variant?.sku,
    variant_title: e.node.variant?.title,
    weight: e.node.variant?.inventoryItem?.measurement?.weight?.value,
    weight_unit: e.node.variant?.inventoryItem?.measurement?.weight?.unit,
    image: e.node.variant?.image?.url,
  }));

  const fulfillments = shopifyOrder.fulfillments || [];
  const lastFulfillment = fulfillments[fulfillments.length - 1];
  
  // orderName is usually like #1001, so we strip non-digits to get a number if possible
  const parsedOrderNumber = parseInt(shopifyOrder.name.replace(/\\D/g, ""), 10);

  const orderPayload: any = {
    shopify_order_id: parseInt(shopifyOrder.id.split("/").pop()!),
    shopify_order_name: shopifyOrder.name,
    shopify_order_number: isNaN(parsedOrderNumber) ? null : parsedOrderNumber,
    customer_shopify_id: customer ? parseInt(customer.id.split("/").pop()!) : null,
    customer_name: shippingAddr?.name || (customer ? `${customer.firstName} ${customer.lastName}`.trim() : "Unknown"),
    customer_phone: shippingAddr?.phone || customer?.phone || null,
    customer_email: customer?.email || shopifyOrder.email,
    shipping_address: shippingAddr,
    line_items: lineItems,
    total_price: parseFloat(shopifyOrder.totalPriceSet?.shopMoney?.amount || "0"),
    subtotal_price: parseFloat(shopifyOrder.subtotalPriceSet?.shopMoney?.amount || "0"),
    total_tax: parseFloat(shopifyOrder.totalTaxSet?.shopMoney?.amount || "0"),
    currency: shopifyOrder.totalPriceSet?.shopMoney?.currencyCode || "BDT",
    financial_status: shopifyOrder.displayFinancialStatus?.toLowerCase(),
    fulfillment_status: shopifyOrder.displayFulfillmentStatus?.toLowerCase() || null,
    shopify_tags: shopifyOrder.tags || [],
    note: shopifyOrder.note,
    shopify_created_at: shopifyOrder.createdAt,
    shopify_updated_at: shopifyOrder.updatedAt,
    shopify_fulfillment_id: lastFulfillment?.id
      ? parseInt(lastFulfillment.id.split("/").pop()!).toString()
      : null,
    synced_at: new Date().toISOString(),
  };

  if (shopifyOrder.cancelledAt) {
    orderPayload.internal_status = "cancelled";
    orderPayload.cancel_reason = shopifyOrder.cancelReason || "Cancelled via Shopify";
  }

  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("shopify_order_id", orderPayload.shopify_order_id)
    .maybeSingle();

  if (!existingOrder) {
    if (!settings) {
      const { data } = await supabase.from("app_settings").select("fraud_check_enabled, fraudspy_api_key, sms_auto_order_enabled, sms_auto_order_template").single();
      settings = data;
    }
    
    let fraudRes: any = null;
    if (settings?.fraud_check_enabled && settings.fraudspy_api_key && orderPayload.customer_phone) {
      const { searchFraud } = await import("@/lib/fraudspy");
      fraudRes = await searchFraud(orderPayload.customer_phone, settings.fraudspy_api_key);
      
      if (fraudRes && fraudRes.ok) {
        orderPayload.fraud_data = fraudRes;
        if (fraudRes.fraud_reports?.count > 0) {
          orderPayload.fraud_status = "fraud";
          orderPayload.fraud_score = 100;
        } else if (fraudRes.overall?.success_ratio < 60 && fraudRes.overall?.total > 3) {
          orderPayload.fraud_status = "risky";
          orderPayload.fraud_score = 80;
        } else if (fraudRes.overall?.success_ratio < 80 && fraudRes.overall?.total > 5) {
          orderPayload.fraud_status = "risky";
          orderPayload.fraud_score = 50;
        } else {
          orderPayload.fraud_status = "safe";
          orderPayload.fraud_score = 0;
        }
      }
    }

    const { data: upsertedOrder } = await supabase.from("orders").upsert(
      orderPayload,
      { onConflict: "shopify_order_id" }
    ).select().single();

    // Fire off async side effects concurrently after saving to DB to avoid blocking
    const sideEffects = [];
    
    if (fraudRes && fraudRes.ok) {
      const noteAppend = `[FraudSpy Report]\nStatus: ${orderPayload.fraud_status.toUpperCase()}\nScore: ${orderPayload.fraud_score}\nDelivered: ${fraudRes.overall?.delivered || 0}\nReturned: ${fraudRes.overall?.returned || 0}\nSuccess Ratio: ${fraudRes.overall?.success_ratio || 0}%\nLast Checked: ${new Date().toISOString()}`;
      const tag = `FraudSpy: ${orderPayload.fraud_status === 'fraud' ? 'High Risk' : orderPayload.fraud_status === 'risky' ? 'Medium Risk' : 'Safe'}`;

      const { updateShopifyCustomer, updateShopifyOrder } = await import("@/lib/shopify/client");
      
      if (orderPayload.customer_shopify_id) {
        sideEffects.push(
          supabase.from("customers").select("shopify_tags").eq("shopify_customer_id", orderPayload.customer_shopify_id).single()
            .then(async ({ data: customerData }: any) => {
              const existingTags = customerData?.shopify_tags || [];
              const mergedTags = Array.from(new Set([...existingTags, tag, 'FraudSpy Verified']));
              await updateShopifyCustomer({
                id: `gid://shopify/Customer/${orderPayload.customer_shopify_id}`,
                note: noteAppend,
                tags: mergedTags
              });
            })
            .catch((e: any) => console.error("Failed to update Shopify customer during sync:", e))
        );
      }

      if (orderPayload.shopify_order_id) {
        const finalOrderNote = orderPayload.note ? `${orderPayload.note}\n\n${noteAppend}` : noteAppend;
        sideEffects.push(
          updateShopifyOrder({
            id: `gid://shopify/Order/${orderPayload.shopify_order_id}`,
            note: finalOrderNote,
            tags: [tag, 'FraudSpy Verified']
          }).catch(e => console.error("Failed to update Shopify order during sync:", e))
        );
      }
    }

    // Send auto SMS if not a full sync
    if (!isFullSync && settings?.sms_auto_order_enabled && settings?.sms_auto_order_template && orderPayload.customer_phone) {
      const { sendSMS } = await import("@/lib/sms");
      const msg = settings.sms_auto_order_template
        .replace("{{order_id}}", orderPayload.shopify_order_name || orderPayload.shopify_order_id.toString())
        .replace("{{customer_name}}", orderPayload.customer_name || "Customer");
      sideEffects.push(
        sendSMS(orderPayload.customer_phone, msg).catch(e => console.error("Sync SMS Error:", e))
      );
    }

    await Promise.all(sideEffects);
    return;
  }

  const { data: upsertedOrder } = await supabase.from("orders").upsert(
    orderPayload,
    { onConflict: "shopify_order_id" }
  ).select("id").single();

  if (upsertedOrder && !existingOrder) {
    const { logOrderEvent } = await import("@/lib/audit");
    await logOrderEvent(upsertedOrder.id, "SYNCED", "Order synced manually from Shopify");
  }
}

async function upsertShopifyCustomer(supabase: any, customer: any) {
  await supabase.from("customers").upsert(
    {
      shopify_customer_id: parseInt(customer.id.split("/").pop()!),
      name: `${customer.firstName} ${customer.lastName}`.trim(),
      email: customer.email,
      phone: customer.phone,
      total_orders: customer.numberOfOrders || 0,
      total_spent: parseFloat(customer.amountSpent?.amount || "0"),
      synced_at: new Date().toISOString(),
    },
    { onConflict: "shopify_customer_id" }
  );
}
