/**
 * Shopify GraphQL Admin API Client
 * Uses the 2026-07 API version with offline access token (custom app)
 */

import { createServiceClient } from "@/lib/supabase/server";

const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-07";

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

export async function shopifyFetch<T = any>(
  query: string,
  variables?: Record<string, any>,
  maxRetries = 2
): Promise<{ data: T; errors?: any[] }> {
  const { domain, token } = await getShopifyCredentials();
  const endpoint = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: 0 }, // no caching at fetch level — we use Redis
    });

    if (response.status === 429 && attempt < maxRetries) {
      const retryAfterSec = Number(response.headers.get("Retry-After") || 2);
      await new Promise((r) => setTimeout(r, Math.min(retryAfterSec * 1000, 4000)));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json();
    if (json.errors) {
      const isThrottled = json.errors.some(
        (e: any) =>
          e?.extensions?.code === "THROTTLED" ||
          String(e?.message || "").toLowerCase().includes("throttled")
      );
      if (isThrottled && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      console.error("[Shopify] GraphQL errors:", json.errors);
      throw new Error(json.errors[0]?.message || "Shopify GraphQL error");
    }

    return json;
  }

  throw new Error("Shopify API request exceeded retry attempts");
}

// ─── Order Queries ────────────────────────────────────────────────────────────

export const GET_ORDERS_QUERY = `
  query GetOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          updatedAt
          email
          phone
          note
          tags
          displayFinancialStatus
          displayFulfillmentStatus
          totalPriceSet { shopMoney { amount currencyCode } }
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          subtotalPriceSet { shopMoney { amount currencyCode } }
          currentSubtotalPriceSet { shopMoney { amount currencyCode } }
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
                currentQuantity
                sku
                variantTitle
                image { url }
                originalUnitPriceSet { shopMoney { amount currencyCode } }
              }
            }
          }
          fulfillments(first: 5) {
            id
            status
            trackingInfo { number url company }
            createdAt
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

/**
 * Fetches a single Shopify order by ID via REST API to obtain full webhook-compatible payload.
 */
export async function getShopifyOrder(orderId: string | number) {
  const { domain, token } = await getShopifyCredentials();
  const rawId = String(orderId).replace(/\D/g, "");
  if (!rawId) return null;

  const endpoint = `https://${domain}/admin/api/${SHOPIFY_API_VERSION}/orders/${rawId}.json`;
  const res = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    console.error(`[Shopify Client] Failed to fetch order ${orderId}: ${res.status} ${res.statusText}`);
    return null;
  }

  const json = await res.json();
  return json.order || null;
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

// ─── Release Fulfillment Order Hold ──────────────────────────────────────────
const RELEASE_HOLD_MUTATION = `
  mutation ReleaseFulfillmentOrderHold($id: ID!) {
    fulfillmentOrderReleaseHold(id: $id) {
      fulfillmentOrder {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

export async function releaseShopifyFulfillmentOrderHold(fulfillmentOrderId: string) {
  const result = await shopifyFetch(RELEASE_HOLD_MUTATION, {
    id: fulfillmentOrderId,
  });

  const { fulfillmentOrder, userErrors } = result.data.fulfillmentOrderReleaseHold;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e: any) => e.message).join(", "));
  }
  return fulfillmentOrder;
}

// ─── Query Fulfillment Orders ────────────────────────────────────────────────
const GET_FULFILLMENT_ORDERS_QUERY = `
  query GetFulfillmentOrders($orderId: ID!) {
    order(id: $orderId) {
      fulfillmentOrders(first: 10) {
        edges {
          node {
            id
            status
            assignedLocation { name }
          }
        }
      }
    }
  }
`;

export async function getShopifyFulfillmentOrders(
  orderId: string
): Promise<Array<{ id: string; status: string }>> {
  const gid = orderId.startsWith("gid://shopify/Order/")
    ? orderId
    : `gid://shopify/Order/${orderId}`;
  const res = await shopifyFetch(GET_FULFILLMENT_ORDERS_QUERY, {
    orderId: gid,
  });
  const edges = res.data?.order?.fulfillmentOrders?.edges || [];
  return edges.map((e: any) => e.node);
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

/** Returns existing (non-cancelled) fulfillments of a Shopify order, newest first. */
export async function getShopifyOrderFulfillments(
  shopifyOrderId: string | number
): Promise<Array<{ id: string; status: string }>> {
  const raw = String(shopifyOrderId);
  const gid = raw.startsWith("gid://shopify/Order/") ? raw : `gid://shopify/Order/${raw}`;
  const res = await shopifyFetch(
    `query GetOrderFulfillments($id: ID!) { order(id: $id) { fulfillments { id status createdAt } } }`,
    { id: gid }
  );
  const list: Array<{ id: string; status: string; createdAt?: string }> =
    res.data?.order?.fulfillments || [];
  return list
    .filter((f) => f.status !== "CANCELLED" && f.status !== "ERROR" && f.status !== "FAILURE")
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

// ─── Create Fulfillment Event (Mark as Delivered / In Transit) ────────────────
const CREATE_FULFILLMENT_EVENT_MUTATION = `
  mutation CreateFulfillmentEvent($fulfillmentEvent: FulfillmentEventInput!) {
    fulfillmentEventCreate(fulfillmentEvent: $fulfillmentEvent) {
      fulfillmentEvent {
        id
        status
        happenedAt
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Converts any timestamp (including Pathao's "YYYY-MM-DD HH:mm:ss", which is
 * Asia/Dhaka local time) into a valid ISO-8601 DateTime for Shopify.
 * Falls back to "now" if the value is missing or unparseable.
 */
export function toShopifyDateTime(value?: string | null): string {
  if (!value) return new Date().toISOString();
  const raw = String(value).trim();
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const isoLike = raw.replace(" ", "T");
  const candidate = hasZone ? isoLike : `${isoLike}+06:00`;
  const d = new Date(candidate);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export async function createShopifyFulfillmentEvent(params: {
  fulfillmentId: string;
  status:
    | "CONFIRMED"
    | "DELIVERED"
    | "OUT_FOR_DELIVERY"
    | "IN_TRANSIT"
    | "ATTEMPTED_DELIVERY"
    | "CARRIER_PICKED_UP"
    | "FAILURE";
  message?: string;
  happenedAt?: string;
}) {
  const gid = params.fulfillmentId.startsWith("gid://shopify/Fulfillment/")
    ? params.fulfillmentId
    : `gid://shopify/Fulfillment/${params.fulfillmentId}`;

  const result = await shopifyFetch(CREATE_FULFILLMENT_EVENT_MUTATION, {
    fulfillmentEvent: {
      fulfillmentId: gid,
      status: params.status,
      ...(params.message ? { message: params.message } : {}),
      happenedAt: toShopifyDateTime(params.happenedAt),
    },
  });

  const res = result.data?.fulfillmentEventCreate;
  if (res?.userErrors?.length) {
    throw new Error(res.userErrors.map((e: any) => e.message).join(", "));
  }
  return res?.fulfillmentEvent;
}

/**
 * Synchronizes a normalized Pathao parcel status event to Shopify fulfillment & order tags.
 * Strict separation of concerns:
 * - Never forces Shopify order financial status to Paid.
 * - Never creates automatic customer refunds on Shopify.
 * - Reuses existing fulfillment or creates one with Pathao tracking info if missing.
 */
export async function syncPathaoStatusToShopifyFulfillment(params: {
  shopifyOrderId?: string | number | null;
  shopifyFulfillmentId?: string | number | null;
  consignmentId: string;
  trackingUrl?: string | null;
  normalizedStatus: string;
  displayLabel: string;
  shopifyFulfillmentEvent?:
    | "CONFIRMED"
    | "DELIVERED"
    | "OUT_FOR_DELIVERY"
    | "IN_TRANSIT"
    | "ATTEMPTED_DELIVERY"
    | "CARRIER_PICKED_UP"
    | "FAILURE"
    | null;
  reason?: string | null;
  eventTimestamp?: string | null;
}): Promise<{
  success: boolean;
  fulfillmentId: string | null;
  errors: string[];
}> {
  const errors: string[] = [];
  let fulfillmentId = params.shopifyFulfillmentId
    ? String(params.shopifyFulfillmentId)
    : null;
  const rawOrderId = params.shopifyOrderId
    ? String(params.shopifyOrderId)
    : null;
  const orderGid = rawOrderId
    ? rawOrderId.startsWith("gid://shopify/Order/")
      ? rawOrderId
      : `gid://shopify/Order/${rawOrderId}`
    : null;

  if (!orderGid && !fulfillmentId) {
    return {
      success: false,
      fulfillmentId: null,
      errors: ["Missing Shopify Order ID and Fulfillment ID"],
    };
  }

  // 1. Ensure fulfillment exists or look up existing non-cancelled fulfillment
  if (!fulfillmentId && orderGid) {
    try {
      const existing = await getShopifyOrderFulfillments(orderGid);
      if (existing.length > 0) {
        fulfillmentId = existing[0].id;
      } else if (
        params.normalizedStatus !== "PICKUP_CANCELLED" &&
        params.normalizedStatus !== "UNKNOWN_EVENT"
      ) {
        // Create initial fulfillment with Pathao tracking info if unfulfilled
        const fulfillmentOrders = await getShopifyFulfillmentOrders(orderGid);
        const openFo = fulfillmentOrders.find(
          (fo: any) => fo.status === "OPEN" || fo.status === "IN_PROGRESS"
        );
        if (openFo) {
          const created = await createShopifyFulfillment({
            fulfillmentOrderId: openFo.id,
            trackingNumber: params.consignmentId,
            trackingCompany: "Pathao",
            trackingUrl:
              params.trackingUrl ||
              `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(params.consignmentId)}`,
            notifyCustomer: false,
          });
          if (created?.id) {
            fulfillmentId = created.id;
          }
        }
      }
    } catch (err: any) {
      errors.push(`Fulfillment lookup/create: ${err.message}`);
    }
  }

  // 2. Record fulfillment event on Shopify if mapped
  if (fulfillmentId && params.shopifyFulfillmentEvent) {
    try {
      const msgParts = [
        `Pathao: ${params.displayLabel} (${params.consignmentId})`,
      ];
      if (params.reason) msgParts.push(`Reason: ${params.reason}`);
      await createShopifyFulfillmentEvent({
        fulfillmentId,
        status: params.shopifyFulfillmentEvent,
        message: msgParts.join(" — "),
        happenedAt: params.eventTimestamp || new Date().toISOString(),
      });
    } catch (err: any) {
      errors.push(`Fulfillment event (${params.shopifyFulfillmentEvent}): ${err.message}`);
    }
  }

  // 3. Synchronize order tags for terminal/milestone states without altering financial_status
  if (orderGid) {
    try {
      if (params.normalizedStatus === "DELIVERED") {
        const tagsRes = await shopifyFetch(
          `query GetOrderTags($id: ID!) { order(id: $id) { id tags } }`,
          { id: orderGid }
        );
        const currentTags: string[] = tagsRes.data?.order?.tags || [];
        if (!currentTags.includes("Delivered")) {
          const newTags = [
            ...currentTags.filter(
              (t) =>
                t !== "In Transit" &&
                t !== "Dispatched" &&
                t !== "On Hold" &&
                t !== "Delivery Failed"
            ),
            "Delivered",
          ];
          await updateShopifyOrder({ id: orderGid, tags: newTags });
        }
      } else if (params.normalizedStatus === "PARTIALLY_DELIVERED") {
        await markShopifyOrderAsPartialDelivered({
          shopifyOrderId: orderGid,
          shopifyFulfillmentId: fulfillmentId,
          consignmentId: params.consignmentId,
          note: params.reason
            ? `[MiBx Dispatch] Pathao Partial Delivery (${params.consignmentId}): ${params.reason}`
            : undefined,
        });
      }
    } catch (err: any) {
      errors.push(`Order tag sync: ${err.message}`);
    }
  }

  return {
    success: errors.length === 0,
    fulfillmentId,
    errors,
  };
}

/**
 * Marks an order as delivered on Shopify by creating a DELIVERED fulfillment event
 * and tagging the order with "Delivered".
 * NOTE: Does NOT force Shopify financial status to Paid (delivery != COD settlement).
 */
export async function markShopifyOrderAsDelivered(params: {
  shopifyOrderId?: string | number | null;
  shopifyFulfillmentId?: string | number | null;
  consignmentId?: string | null;
}) {
  const errors: string[] = [];
  let fulfillmentId = params.shopifyFulfillmentId ? String(params.shopifyFulfillmentId) : null;
  const rawOrderId = params.shopifyOrderId ? String(params.shopifyOrderId) : null;
  const orderGid = rawOrderId
    ? rawOrderId.startsWith("gid://shopify/Order/")
      ? rawOrderId
      : `gid://shopify/Order/${rawOrderId}`
    : null;

  // 1. If fulfillmentId is missing, look it up on Shopify using orderGid
  if (!fulfillmentId && orderGid) {
    try {
      const orderQuery = `
        query GetOrderFulfillments($id: ID!) {
          order(id: $id) {
            id
            fulfillments {
              id
              status
            }
          }
        }
      `;
      const res = await shopifyFetch(orderQuery, { id: orderGid });
      const fulfillments = res.data?.order?.fulfillments || [];
      if (fulfillments.length > 0) {
        fulfillmentId = fulfillments[0].id;
      }
    } catch (err: any) {
      console.error("[Shopify] Failed to fetch order fulfillments:", err);
      errors.push(`Lookup fulfillments: ${err.message}`);
    }
  }

  // 2. If we have a fulfillmentId, create the DELIVERED event on Shopify
  if (fulfillmentId) {
    try {
      await createShopifyFulfillmentEvent({
        fulfillmentId,
        status: "DELIVERED",
        message: params.consignmentId
          ? `Delivered via Pathao Courier (${params.consignmentId})`
          : "Delivered via Pathao Courier",
        happenedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[Shopify] Failed to create DELIVERED event on fulfillment:", err);
      errors.push(`Fulfillment event: ${err.message}`);
    }
  }

  // 3. Add "Delivered" tag to the Shopify order (without forcing financial status to Paid)
  if (orderGid) {
    try {
      const getTagsQuery = `
        query GetOrderTags($id: ID!) {
          order(id: $id) {
            id
            tags
          }
        }
      `;
      const tagsRes = await shopifyFetch(getTagsQuery, { id: orderGid });
      const currentTags: string[] = tagsRes.data?.order?.tags || [];
      if (!currentTags.includes("Delivered")) {
        const newTags = [...currentTags.filter((t) => t !== "In Transit" && t !== "Dispatched"), "Delivered"];
        await updateShopifyOrder({
          id: orderGid,
          tags: newTags,
        });
      }
    } catch (err: any) {
      console.error("[Shopify] Failed to update tags on order:", err);
      errors.push(`Tags update: ${err.message}`);
    }
  }

  return {
    success: errors.length === 0,
    fulfillmentId,
    errors,
  };
}

/**
 * Marks an order as Partial Delivery on Shopify:
 * 1. Appends "Partial Delivery" tag to order
 * 2. Adds order note about partial delivery and courier consignment
 */
export async function markShopifyOrderAsPartialDelivered(params: {
  shopifyOrderId?: string | number | null;
  shopifyFulfillmentId?: string | number | null;
  consignmentId?: string | null;
  note?: string | null;
}) {
  const errors: string[] = [];
  const rawOrderId = params.shopifyOrderId ? String(params.shopifyOrderId) : null;
  const orderGid = rawOrderId
    ? rawOrderId.startsWith("gid://shopify/Order/")
      ? rawOrderId
      : `gid://shopify/Order/${rawOrderId}`
    : null;

  if (orderGid) {
    try {
      const getTagsQuery = `
        query GetOrderTags($id: ID!) {
          order(id: $id) {
            id
            tags
            note
          }
        }
      `;
      const tagsRes = await shopifyFetch(getTagsQuery, { id: orderGid });
      const currentTags: string[] = tagsRes.data?.order?.tags || [];
      const currentNote: string = tagsRes.data?.order?.note || "";

      const newTags = [
        ...currentTags.filter((t) => t !== "In Transit" && t !== "Dispatched" && t !== "Delivered"),
        "Partial Delivery",
      ];

      const deliveryNote = params.note || (params.consignmentId
        ? `[MiBx ERP] Partial delivery recorded via Pathao Courier (Consignment: ${params.consignmentId})`
        : `[MiBx ERP] Partial delivery recorded via Pathao Courier`);

      const updatedNote = currentNote
        ? `${currentNote}\n${deliveryNote}`
        : deliveryNote;

      await updateShopifyOrder({
        id: orderGid,
        tags: Array.from(new Set(newTags)),
        note: updatedNote,
      });
    } catch (err: any) {
      console.error("[Shopify] Failed to sync partial delivery to Shopify:", err);
      errors.push(`Partial delivery sync: ${err.message}`);
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

// ─── Mark Order as Paid ───────────────────────────────────────────────────────
const MARK_AS_PAID_MUTATION = `
  mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
    orderMarkAsPaid(input: $input) {
      order { id displayFinancialStatus }
      userErrors { field message }
    }
  }
`;

export async function markShopifyOrderAsPaid(orderId: string) {
  const gid = orderId.startsWith("gid://shopify/Order/")
    ? orderId
    : `gid://shopify/Order/${orderId}`;
    
  const result = await shopifyFetch(MARK_AS_PAID_MUTATION, {
    input: { id: gid },
  });
  
  const res = result.data?.orderMarkAsPaid;
  if (res?.userErrors?.length) {
    throw new Error(res.userErrors.map((e: any) => e.message).join(", "));
  }
  return res?.order;
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

// ─── Add Order Note / Tags / Custom Attributes ──────────────────────────────────
const UPDATE_ORDER_MUTATION = `
  mutation UpdateOrder($input: OrderInput!) {
    orderUpdate(input: $input) {
      order { id name note tags customAttributes { key value } }
      userErrors { field message }
    }
  }
`;

export async function updateShopifyOrder(params: {
  id: string;
  note?: string;
  tags?: string[];
  customAttributes?: Array<{ key: string; value: string }>;
  metafields?: Array<{ namespace: string; key: string; value: string; type: string }>;
}) {
  const result = await shopifyFetch(UPDATE_ORDER_MUTATION, {
    input: {
      id: params.id,
      ...(params.note !== undefined ? { note: params.note } : {}),
      ...(params.tags ? { tags: params.tags } : {}),
      ...(params.customAttributes ? { customAttributes: params.customAttributes } : {}),
      ...(params.metafields ? { metafields: params.metafields } : {}),
    },
  });
  const { order, userErrors } = result.data.orderUpdate;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e: any) => e.message).join(", "));
  }
  return order;
}

// ─── Update Customer ──────────────────────────────────────────────────────────
const UPDATE_CUSTOMER_MUTATION = `
  mutation UpdateCustomer($input: CustomerInput!) {
    customerUpdate(input: $input) {
      customer { id note tags }
      userErrors { field message }
    }
  }
`;

export async function updateShopifyCustomer(params: {
  id: string;
  note?: string;
  tags?: string[];
}) {
  const result = await shopifyFetch(UPDATE_CUSTOMER_MUTATION, {
    input: {
      id: params.id,
      ...(params.note !== undefined ? { note: params.note } : {}),
      ...(params.tags ? { tags: params.tags } : {}),
    },
  });
  const { customer, userErrors } = result.data.customerUpdate;
  if (userErrors?.length) {
    throw new Error(userErrors.map((e: any) => e.message).join(", "));
  }
  return customer;
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
  secret?: string | string[]
): boolean {
  if (!hmacHeader || !rawBody) return false;

  const secretsToCheck: string[] = [];
  if (Array.isArray(secret)) {
    secretsToCheck.push(...secret);
  } else if (secret) {
    secretsToCheck.push(secret);
  }

  if (process.env.SHOPIFY_WEBHOOK_SECRET) {
    secretsToCheck.push(process.env.SHOPIFY_WEBHOOK_SECRET);
  }
  if (process.env.SHOPIFY_CLIENT_SECRET) {
    secretsToCheck.push(process.env.SHOPIFY_CLIENT_SECRET);
  }

  const uniqueSecrets = Array.from(new Set(secretsToCheck.map((s) => s.trim()).filter(Boolean)));
  if (uniqueSecrets.length === 0) {
    console.error("[Shopify Webhook] No webhook secret configured in app_settings or environment variables.");
    return false;
  }

  const hmacBuf = Buffer.from(hmacHeader.trim());

  for (const candidateSecret of uniqueSecrets) {
    try {
      const hash = createHmac("sha256", candidateSecret)
        .update(rawBody, "utf8")
        .digest("base64");

      const hashBuf = Buffer.from(hash);
      if (hashBuf.length === hmacBuf.length && timingSafeEqual(hashBuf, hmacBuf)) {
        return true;
      }
    } catch {
      // Continue to next secret
    }
  }

  return false;
}
