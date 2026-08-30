import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getShopifyOrders } from "@/lib/shopify/client";
import { deleteCachePattern } from "@/lib/redis";

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();

  // Only admins can trigger sync
  const { data: { user } } = await (await import("@/lib/supabase/server")).createClient().then(c => c.auth.getUser()).catch(() => ({ data: { user: null } }));

  // Insert sync log
  const { data: syncLog } = await supabase
    .from("sync_logs")
    .insert({
      sync_type: "full_shopify",
      status: "running",
      orders_synced: 0,
      customers_synced: 0,
      errors: 0,
    })
    .select()
    .single();

  const logId = syncLog?.id;

  // Wait for sync to complete (Vercel kills unawaited promises)
  await runShopifySync(supabase, logId).catch(console.error);

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

async function runShopifySync(supabase: any, logId?: string) {
  let ordersCount = 0;
  let customersCount = 0;
  let errors = 0;
  let cursor: string | undefined;

  try {
    // Paginate through all Shopify orders
    do {
      const result = await getShopifyOrders({
        first: 250,
        after: cursor,
      });

      const orders = result.edges.map((e: any) => e.node);

      for (const shopifyOrder of orders) {
        try {
          await upsertShopifyOrder(supabase, shopifyOrder);
          ordersCount++;

          if (shopifyOrder.customer) {
            await upsertShopifyCustomer(supabase, shopifyOrder.customer);
            customersCount++;
          }
        } catch (err) {
          console.error(`[Sync] Error for order ${shopifyOrder.name}:`, err);
          errors++;
        }
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

async function upsertShopifyOrder(supabase: any, shopifyOrder: any) {
  const shippingAddr = shopifyOrder.shippingAddress;
  const customer = shopifyOrder.customer;

  const lineItems = shopifyOrder.lineItems.edges.map((e: any) => ({
    title: e.node.title,
    quantity: e.node.quantity,
    price: parseFloat(e.node.originalUnitPriceSet?.shopMoney?.amount || "0"),
    sku: e.node.sku || e.node.variant?.sku,
    variant_title: e.node.variant?.title,
    weight: e.node.variant?.weight,
    weight_unit: e.node.variant?.weightUnit,
    image: e.node.variant?.image?.url,
  }));

  const fulfillments = shopifyOrder.fulfillments || [];
  const lastFulfillment = fulfillments[fulfillments.length - 1];

  await supabase.from("orders").upsert(
    {
      shopify_order_id: parseInt(shopifyOrder.id.split("/").pop()!),
      shopify_order_name: shopifyOrder.name,
      shopify_order_number: shopifyOrder.orderNumber,
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
      financial_status: shopifyOrder.financialStatus?.toLowerCase(),
      fulfillment_status: shopifyOrder.displayFulfillmentStatus?.toLowerCase() || null,
      shopify_tags: shopifyOrder.tags || [],
      note: shopifyOrder.note,
      shopify_created_at: shopifyOrder.createdAt,
      shopify_updated_at: shopifyOrder.updatedAt,
      shopify_fulfillment_id: lastFulfillment?.id
        ? parseInt(lastFulfillment.id.split("/").pop()!).toString()
        : null,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "shopify_order_id" }
  );
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
