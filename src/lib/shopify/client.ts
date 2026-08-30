/**
 * Shopify GraphQL Admin API Client
 * Uses the 2026-07 API version with offline access token (custom app)
 */

import { createServiceClient } from "@/lib/supabase/server";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-07";

async function getShopifyCredentials() {
  // If not using OAuth, fallback to env variables if provided
  if (process.env.SHOPIFY_SHOP_DOMAIN && process.env.SHOPIFY_ACCESS_TOKEN) {
    return {
      domain: process.env.SHOPIFY_SHOP_DOMAIN,
      token: process.env.SHOPIFY_ACCESS_TOKEN,
    };
  }

  const supabase = createServiceClient();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("shopify_shop_domain, shopify_access_token")
    .single();

  if (!settings?.shopify_shop_domain || !settings?.shopify_access_token) {
    throw new Error("Shopify credentials not found in App Settings. Please install the app via OAuth.");
  }

  return {
    domain: settings.shopify_shop_domain,
    token: settings.shopify_access_token,
  };
}

async function shopifyFetch<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<{ data: T; errors?: any[] }> {
  const { domain, token } = await getShopifyCredentials();
  const endpoint = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 0 }, // no caching at fetch level — we use Redis
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json();
  if (json.errors) {
    console.error("[Shopify] GraphQL errors:", json.errors);
    throw new Error(json.errors[0]?.message || "Shopify GraphQL error");
  }

  return json;
}

// ─── Order Queries ────────────────────────────────────────────────────────────

export const GET_ORDERS_QUERY = `
  query GetOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          orderNumber
          createdAt
          updatedAt
          email
          phone
          note
          tags
          financialStatus
          displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          totalTaxSet { shopMoney { amount currencyCode } }
          customer {
            id
            firstName
            lastName
            email
            phone
            numberOfOrders
            amountSpent { amount currencyCode }
          }
          shippingAddress {
            name
            phone
            address1
            address2
            city
            province
            zip
            country
            countryCode
          }
          lineItems(first: 20) {
            edges {
              node {
                id
                title
                quantity
                sku
                originalUnitPriceSet { shopMoney { amount currencyCode } }
                variant {
                  id
                  title
                  weight
                  weightUnit
                  sku
                  image { url }
                }
              }
            }
          }
          fulfillments(first: 5) {
            id
            status
            trackingInfo { number url company }
            createdAt
          }
          fulfillmentOrders(first: 5) {
            edges {
              node {
                id
                status
                assignedLocation { name }
              }
            }
          }
          cancelledAt
          cancelReason
        }
      }
    }
  }
`;

export async function getShopifyOrders(options: {
  first?: number;
  after?: string;
  query?: string;
}) {
  const { first = 50, after, query } = options;
  const result = await shopifyFetch(GET_ORDERS_QUERY, { first, after, query });
  return result.data.orders;
}

// ─── Create Fulfillment ───────────────────────────────────────────────────────
const CREATE_FULFILLMENT_MUTATION = `
  mutation CreateFulfillment($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment {
        id
        status
        trackingInfo { number url company }
        createdAt
      }
      userErrors { field message }
    }
  }
`;

export async function createShopifyFulfillment(params: {
  fulfillmentOrderId: string;
  lineItems?: Array<{ id: string; quantity: number }>;
  trackingCompany: string;
  trackingNumber: string;
  trackingUrl?: string;
  notifyCustomer?: boolean;
}) {
  const fulfillmentInput: any = {
    lineItemsByFulfillmentOrder: [
      {
        fulfillmentOrderId: params.fulfillmentOrderId,
        ...(params.lineItems
          ? { fulfillmentOrderLineItems: params.lineItems }
          : {}),
      },
    ],
    trackingInfo: {
      company: params.trackingCompany,
      number: params.trackingNumber,
      ...(params.trackingUrl ? { url: params.trackingUrl } : {}),
    },
    notifyCustomer: params.notifyCustomer ?? true,
  };

  const result = await shopifyFetch(CREATE_FULFILLMENT_MUTATION, {
    fulfillment: fulfillmentInput,
  });

  const { fulfillment, userErrors } = result.data.fulfillmentCreate;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e: any) => e.message).join(", "));
  }
  return fulfillment;
}

// ─── Update Fulfillment Tracking ──────────────────────────────────────────────
const UPDATE_TRACKING_MUTATION = `
  mutation UpdateFulfillmentTracking(
    $fulfillmentId: ID!
    $trackingInfoInput: FulfillmentTrackingInput!
    $notifyCustomer: Boolean
  ) {
    fulfillmentTrackingInfoUpdate(
      fulfillmentId: $fulfillmentId
      trackingInfoInput: $trackingInfoInput
      notifyCustomer: $notifyCustomer
    ) {
      fulfillment {
        id
        status
        trackingInfo { number url company }
      }
      userErrors { field message }
    }
  }
`;

export async function updateShopifyFulfillmentTracking(params: {
  fulfillmentId: string;
  trackingNumber: string;
  trackingCompany: string;
  trackingUrl?: string;
  notifyCustomer?: boolean;
}) {
  const result = await shopifyFetch(UPDATE_TRACKING_MUTATION, {
    fulfillmentId: params.fulfillmentId,
    trackingInfoInput: {
      number: params.trackingNumber,
      company: params.trackingCompany,
      ...(params.trackingUrl ? { url: params.trackingUrl } : {}),
    },
    notifyCustomer: params.notifyCustomer ?? false,
  });

  const { fulfillment, userErrors } = result.data.fulfillmentTrackingInfoUpdate;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e: any) => e.message).join(", "));
  }
  return fulfillment;
}

// ─── Cancel Order ─────────────────────────────────────────────────────────────
const CANCEL_ORDER_MUTATION = `
  mutation CancelOrder($orderId: ID!, $reason: OrderCancelReason!, $refund: Boolean!, $restock: Boolean!, $notifyCustomer: Boolean!) {
    orderCancel(orderId: $orderId, reason: $reason, refund: $refund, restock: $restock, notifyCustomer: $notifyCustomer) {
      orderCancelUserErrors { field message }
      job { id done }
    }
  }
`;

export async function cancelShopifyOrder(orderId: string, reason = "OTHER") {
  const result = await shopifyFetch(CANCEL_ORDER_MUTATION, {
    orderId,
    reason,
    refund: false,
    restock: true,
    notifyCustomer: false,
  });
  return result.data.orderCancel;
}

// ─── Add Order Note / Tags ────────────────────────────────────────────────────
const UPDATE_ORDER_MUTATION = `
  mutation UpdateOrder($input: OrderInput!) {
    orderUpdate(input: $input) {
      order { id name note tags }
      userErrors { field message }
    }
  }
`;

export async function updateShopifyOrder(params: {
  id: string;
  note?: string;
  tags?: string[];
  metafields?: Array<{ namespace: string; key: string; value: string; type: string }>;
}) {
  const result = await shopifyFetch(UPDATE_ORDER_MUTATION, {
    input: {
      id: params.id,
      ...(params.note !== undefined ? { note: params.note } : {}),
      ...(params.tags ? { tags: params.tags } : {}),
    },
  });
  const { order, userErrors } = result.data.orderUpdate;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e: any) => e.message).join(", "));
  }
  return order;
}

// ─── Register Webhook ─────────────────────────────────────────────────────────
const CREATE_WEBHOOK_MUTATION = `
  mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: { callbackUrl: $callbackUrl, format: JSON }
    ) {
      webhookSubscription { id topic callbackUrl }
      userErrors { field message }
    }
  }
`;

export async function registerShopifyWebhook(topic: string, callbackUrl: string) {
  const result = await shopifyFetch(CREATE_WEBHOOK_MUTATION, {
    topic,
    callbackUrl,
  });
  const { webhookSubscription, userErrors } = result.data.webhookSubscriptionCreate;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e: any) => e.message).join(", "));
  }
  return webhookSubscription;
}

// ─── Get Registered Webhooks ──────────────────────────────────────────────────
const GET_WEBHOOKS_QUERY = `
  query GetWebhooks {
    webhookSubscriptions(first: 25) {
      edges {
        node { id topic callbackUrl createdAt }
      }
    }
  }
`;

export async function getShopifyWebhooks() {
  const result = await shopifyFetch(GET_WEBHOOKS_QUERY);
  return result.data.webhookSubscriptions.edges.map((e: any) => e.node);
}

// ─── Delete Webhook ───────────────────────────────────────────────────────────
const DELETE_WEBHOOK_MUTATION = `
  mutation DeleteWebhook($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors { field message }
    }
  }
`;

export async function deleteShopifyWebhook(id: string) {
  const result = await shopifyFetch(DELETE_WEBHOOK_MUTATION, { id });
  return result.data.webhookSubscriptionDelete;
}

// ─── Test Connection ──────────────────────────────────────────────────────────
export async function testShopifyConnection(): Promise<{
  ok: boolean;
  shop?: string;
  error?: string;
}> {
  try {
    const result = await shopifyFetch(`
      query { shop { name myshopifyDomain plan { displayName } } }
    `);
    return {
      ok: true,
      shop: result.data.shop.name,
    };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ─── Verify Webhook HMAC ──────────────────────────────────────────────────────
import { createHmac, timingSafeEqual } from "crypto";

export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string,
  secret?: string
): boolean {
  const webhookSecret = secret || process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!webhookSecret) return false;

  const hash = createHmac("sha256", webhookSecret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return timingSafeEqual(Buffer.from(hash), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}
