import { createServiceClient } from "@/lib/supabase/server";
import { deleteCachePattern } from "@/lib/redis";

interface SyncResult {
  success: boolean;
  collectionsSynced: number;
  productsSynced: number;
  ordersSynced: number;
  lineItemsSynced: number;
  durationMs: number;
  error?: string;
}

const DEFAULT_API_VERSION = "2024-07";

async function getCredentials() {
  if (process.env.SHOPIFY_SHOP_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN) {
    return {
      domain: process.env.SHOPIFY_SHOP_DOMAIN,
      token: process.env.SHOPIFY_ACCESS_TOKEN,
      version: process.env.SHOPIFY_API_VERSION || DEFAULT_API_VERSION,
    };
  }

  const supabase = createServiceClient();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("shopify_shop_domain, shopify_access_token, shopify_api_version")
    .single();

  if (!settings?.shopify_shop_domain || !settings?.shopify_access_token) {
    throw new Error("Shopify credentials not found. Please configure Shopify settings.");
  }

  return {
    domain: settings.shopify_shop_domain,
    token: settings.shopify_access_token,
    version: settings.shopify_api_version || DEFAULT_API_VERSION,
  };
}

async function shopifyGraphQL<T = any>(
  query: string,
  variables?: Record<string, any>,
  attempt = 1
): Promise<{ data: T; extensions?: any }> {
  const { domain, token, version } = await getCredentials();
  const endpoint = `https://${domain}/admin/api/${version}/graphql.json`;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
    });

    if (res.status === 429) {
      if (attempt <= 3) {
        const retryAfter = Number(res.headers.get("Retry-After")) || attempt * 2;
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        return shopifyGraphQL<T>(query, variables, attempt + 1);
      }
      throw new Error("Shopify API rate limit exceeded after 3 retries.");
    }

    if (!res.ok) {
      throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors.map((e: any) => e.message).join(", "));
    }

    // Rate limit throttle budget check
    const throttleStatus = json.extensions?.cost?.throttleStatus;
    if (throttleStatus && throttleStatus.currentlyAvailable < 150) {
      const needed = 150 - throttleStatus.currentlyAvailable;
      const restoreRate = throttleStatus.restoreRate || 50;
      const waitMs = Math.ceil((needed / restoreRate) * 1000);
      await new Promise((resolve) => setTimeout(resolve, Math.min(waitMs, 3000)));
    }

    return json;
  } catch (err: any) {
    if (attempt <= 2 && (err.message.includes("fetch failed") || err.message.includes("ECONNRESET"))) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return shopifyGraphQL<T>(query, variables, attempt + 1);
    }
    throw err;
  }
}

// ─── Collections Sync ─────────────────────────────────────────────────────────

const COLLECTIONS_QUERY = `
  query GetCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          productsCount {
            count
          }
        }
      }
    }
  }
`;

export async function syncShopifyCollections(supabase: any) {
  let hasNextPage = true;
  let cursor: string | undefined = undefined;
  let count = 0;

  while (hasNextPage) {
    const result: any = await shopifyGraphQL(COLLECTIONS_QUERY, { first: 100, after: cursor });
    const edges = result.data?.collections?.edges || [];
    if (edges.length === 0) break;

    const rows = edges.map((e: any) => {
      const node = e.node;
      const rawCount = node.productsCount?.count ?? node.productsCount ?? 0;
      return {
        shopify_collection_id: node.id,
        title: node.title,
        handle: node.handle || null,
        products_count: Number(rawCount) || 0,
        synced_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from("shopify_collections")
      .upsert(rows, { onConflict: "shopify_collection_id" });

    if (error) {
      console.error("[ShopifySalesSync] Error upserting collections:", error);
      throw error;
    }

    count += rows.length;
    hasNextPage = result.data?.collections?.pageInfo?.hasNextPage ?? false;
    cursor = result.data?.collections?.pageInfo?.endCursor;
  }

  return count;
}

// ─── Products Sync ───────────────────────────────────────────────────────────

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          vendor
          productType
          status
          featuredImage {
            url
          }
          collections(first: 20) {
            edges {
              node {
                id
                title
                handle
              }
            }
          }
          variants(first: 50) {
            edges {
              node {
                id
                title
                price
                sku
              }
            }
          }
        }
      }
    }
  }
`;

export async function syncShopifyProducts(supabase: any) {
  let hasNextPage = true;
  let cursor: string | undefined = undefined;
  let count = 0;
  const productCollectionMap = new Map<string, string[]>();

  while (hasNextPage) {
    const result: any = await shopifyGraphQL(PRODUCTS_QUERY, { first: 100, after: cursor });
    const edges = result.data?.products?.edges || [];
    if (edges.length === 0) break;

    const rows = edges.map((e: any) => {
      const node = e.node;
      const collections = (node.collections?.edges || []).map((c: any) => ({
        id: c.node.id,
        title: c.node.title,
        handle: c.node.handle,
      }));

      const collectionIds = collections.map((c: any) => c.id);
      productCollectionMap.set(node.id, collectionIds);

      const variants = (node.variants?.edges || []).map((v: any) => ({
        id: v.node.id,
        title: v.node.title,
        price: v.node.price,
        sku: v.node.sku || null,
      }));

      return {
        shopify_product_id: node.id,
        title: node.title,
        vendor: (node.vendor || "Default Vendor").trim(),
        product_type: node.productType || "",
        collections,
        variants,
        image_url: node.featuredImage?.url || null,
        status: node.status || "ACTIVE",
        synced_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from("shopify_products")
      .upsert(rows, { onConflict: "shopify_product_id" });

    if (error) {
      console.error("[ShopifySalesSync] Error upserting products:", error);
      throw error;
    }

    count += rows.length;
    hasNextPage = result.data?.products?.pageInfo?.hasNextPage ?? false;
    cursor = result.data?.products?.pageInfo?.endCursor;
  }

  return { count, productCollectionMap };
}

// ─── Orders & Line Items Sync ─────────────────────────────────────────────────

const ORDERS_QUERY = `
  query GetSalesOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          displayFinancialStatus
          displayFulfillmentStatus
          cancelledAt
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
            }
          }
          customer {
            id
            displayName
          }
          lineItems(first: 50) {
            edges {
              node {
                id
                title
                vendor
                quantity
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                sku
                product {
                  id
                  title
                  vendor
                  productType
                  collections(first: 10) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
                variant {
                  id
                  title
                  price
                  sku
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function syncShopifyOrdersAndLineItems(
  supabase: any,
  options: { fullSync?: boolean; productCollectionMap?: Map<string, string[]> } = {}
) {
  const { fullSync = false, productCollectionMap } = options;

  let query: string | undefined = undefined;
  if (!fullSync) {
    // Delta sync: fetch orders updated/created in the last 7 days or since last order
    const { data: latestOrder } = await supabase
      .from("shopify_orders")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestOrder?.created_at) {
      const since = new Date(new Date(latestOrder.created_at).getTime() - 24 * 60 * 60 * 1000).toISOString();
      query = `created_at:>='${since}'`;
    }
  }

  let hasNextPage = true;
  let cursor: string | undefined = undefined;
  let ordersCount = 0;
  let lineItemsCount = 0;

  while (hasNextPage) {
    const result: any = await shopifyGraphQL(ORDERS_QUERY, {
      first: 50,
      after: cursor,
      query,
    });

    const edges = result.data?.orders?.edges || [];
    if (edges.length === 0) break;

    for (const edge of edges) {
      const order = edge.node;
      const orderId = order.id;
      const totalPrice = Number(order.totalPriceSet?.shopMoney?.amount) || 0;
      const subtotalPrice = Number(order.subtotalPriceSet?.shopMoney?.amount) || 0;
      const currency = order.totalPriceSet?.shopMoney?.currencyCode || "BDT";
      const customerId = order.customer?.id || null;
      const customerName = order.customer?.displayName || null;
      const orderNumberMatch = order.name?.match(/\d+/);
      const orderNumber = orderNumberMatch ? parseInt(orderNumberMatch[0], 10) : null;

      // 1. Upsert Order
      const { data: upsertedOrder, error: orderErr } = await supabase
        .from("shopify_orders")
        .upsert(
          {
            shopify_order_id: orderId,
            shopify_order_number: orderNumber,
            name: order.name,
            created_at: order.createdAt,
            total_price: totalPrice,
            subtotal_price: subtotalPrice,
            currency,
            customer_id: customerId,
            customer_name: customerName,
            financial_status: order.displayFinancialStatus || null,
            fulfillment_status: order.displayFulfillmentStatus || null,
            cancelled_at: order.cancelledAt || null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "shopify_order_id" }
        )
        .select("id")
        .single();

      if (orderErr) {
        console.error(`[ShopifySalesSync] Error upserting order ${order.name}:`, orderErr);
        continue;
      }

      const dbOrderId = upsertedOrder.id;
      ordersCount++;

      // 2. Prepare and Upsert Line Items
      const lineItemEdges = order.lineItems?.edges || [];
      if (lineItemEdges.length > 0) {
        // Delete existing line items for this order to prevent duplicates on update
        await supabase.from("shopify_line_items").delete().eq("order_id", dbOrderId);

        const lineItemRows = lineItemEdges.map((liEdge: any) => {
          const li = liEdge.node;
          const productId = li.product?.id || null;

          // Resolve collection IDs: from lineItem.product.collections or productCollectionMap
          let collectionIds: string[] = [];
          if (li.product?.collections?.edges?.length) {
            collectionIds = li.product.collections.edges.map((ce: any) => ce.node.id);
          } else if (productId && productCollectionMap?.has(productId)) {
            collectionIds = productCollectionMap.get(productId) || [];
          }

          const price = Number(li.originalUnitPriceSet?.shopMoney?.amount) || 0;
          const qty = Number(li.quantity) || 1;

          return {
            order_id: dbOrderId,
            shopify_order_id: orderId,
            shopify_product_id: productId,
            product_name: li.title || "Unknown Product",
            vendor: (li.vendor || li.product?.vendor || "Default Vendor").trim(),
            variant_id: li.variant?.id || null,
            variant_title: li.variant?.title || null,
            quantity: qty,
            price,
            sku: li.sku || li.variant?.sku || null,
            collection_ids: collectionIds,
            order_created_at: order.createdAt,
          };
        });

        const { error: liErr } = await supabase.from("shopify_line_items").insert(lineItemRows);
        if (liErr) {
          console.error(`[ShopifySalesSync] Error inserting line items for order ${order.name}:`, liErr);
        } else {
          lineItemsCount += lineItemRows.length;
        }
      }
    }

    hasNextPage = result.data?.orders?.pageInfo?.hasNextPage ?? false;
    cursor = result.data?.orders?.pageInfo?.endCursor;
  }

  return { ordersCount, lineItemsCount };
}

// ─── Full Unified Sales Sync ──────────────────────────────────────────────────

export async function runFullShopifySalesSync(options: { fullSync?: boolean } = {}): Promise<SyncResult> {
  const startTime = Date.now();
  const supabase = createServiceClient();

  try {
    // 1. Sync Collections
    const collectionsSynced = await syncShopifyCollections(supabase);

    // 2. Sync Products
    const { count: productsSynced, productCollectionMap } = await syncShopifyProducts(supabase);

    // 3. Sync Orders & Line items
    const { ordersCount: ordersSynced, lineItemsCount: lineItemsSynced } = await syncShopifyOrdersAndLineItems(
      supabase,
      {
        fullSync: options.fullSync,
        productCollectionMap,
      }
    );

    // 4. Invalidate all sales reports cached in Redis
    await deleteCachePattern("sales:*").catch((err) => {
      console.warn("[ShopifySalesSync] Redis pattern invalidation error:", err);
    });

    const durationMs = Date.now() - startTime;
    return {
      success: true,
      collectionsSynced,
      productsSynced,
      ordersSynced,
      lineItemsSynced,
      durationMs,
    };
  } catch (err: any) {
    console.error("[ShopifySalesSync] Sync failed:", err);
    return {
      success: false,
      collectionsSynced: 0,
      productsSynced: 0,
      ordersSynced: 0,
      lineItemsSynced: 0,
      durationMs: Date.now() - startTime,
      error: err.message || "Unknown sync error",
    };
  }
}
