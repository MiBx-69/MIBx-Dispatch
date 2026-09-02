require("dotenv").config({ path: ".env" });
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function syncAllOrders() {
  const { data: settings } = await supabase.from("app_settings").select("shopify_shop_domain, shopify_access_token, shopify_api_version").single();
  
  const shopDomain = settings.shopify_shop_domain || process.env.SHOPIFY_SHOP_DOMAIN;
  const accessToken = settings.shopify_access_token; // Access token
  const apiVersion = "2024-07";

  let url = `https://${shopDomain}/admin/api/${apiVersion}/orders.json?status=any&limit=250`;
  let totalImported = 0;

  console.log("Starting full historical order sync...");

  while (url) {
    console.log(`Fetching from: ${url}`);
    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch orders:", await response.text());
      break;
    }

    const data = await response.json();
    const orders = data.orders || [];
    
    if (orders.length === 0) {
      break;
    }

    for (const payload of orders) {
      let trueFulfillmentStatus = payload.fulfillment_status || "unfulfilled";

      // If unfulfilled, check if it's on_hold or in_progress via fulfillments if possible (skipping for script speed)

      // Get or create customer ID in our DB
      let customerId = null;
      if (payload.customer?.id) {
        // Find existing
        const { data: c } = await supabase.from("customers").select("id").eq("shopify_customer_id", payload.customer.id).single();
        if (c) {
          customerId = c.id;
        } else {
          // Create stub
          const { data: newC, error: insertError } = await supabase.from("customers").insert({
            shopify_customer_id: payload.customer.id,
            name: `${payload.customer.first_name || ""} ${payload.customer.last_name || ""}`.trim(),
            email: payload.customer.email,
            phone: payload.customer.phone || payload.customer.default_address?.phone,
            total_orders: payload.customer.orders_count || 0,
            total_spent: parseFloat(payload.customer.total_spent || "0")
          }).select("id").single();
          if (newC) customerId = newC.id;
          if (insertError) console.error("Error creating customer:", insertError.message);
        }
      }

      const orderPayload = {
        shopify_order_id: payload.id,
        shopify_order_name: payload.name,
        shopify_order_number: payload.order_number,
        customer_id: customerId,
        customer_shopify_id: payload.customer?.id || null,
        customer_name: payload.customer ? `${payload.customer.first_name || ""} ${payload.customer.last_name || ""}`.trim() : null,
        customer_phone: payload.phone || payload.customer?.phone || null,
        customer_email: payload.email || payload.customer?.email || null,
        shipping_address: payload.shipping_address || null,
        line_items: payload.line_items || [],
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

      const { error: upsertError } = await supabase
        .from("orders")
        .upsert(orderPayload, { onConflict: "shopify_order_id" });

      if (upsertError) {
        console.error(`Error upserting order ${payload.id}:`, upsertError.message);
      } else {
        totalImported++;
      }
    }

    // Handle pagination (Link header)
    const linkHeader = response.headers.get("link");
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = match ? match[1] : null;
    } else {
      url = null;
    }
  }

  console.log(`Done! Synced ${totalImported} orders.`);
}

syncAllOrders();
