/**
 * Pathao Merchant API Client
 * Ported from server/src/pathao into the Next.js app for unified deployment
 */

import { redis, CACHE_KEYS, TTL, getCache, setCache } from "@/lib/redis";

const PATHAO_BASE_URL =
  process.env.PATHAO_BASE_URL || "https://api-hermes.pathao.com";

// ─── Token Management ─────────────────────────────────────────────────────────

interface PathaoToken {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

async function getStoredToken(): Promise<PathaoToken | null> {
  return getCache<PathaoToken>(CACHE_KEYS.PATHAO_TOKEN);
}

async function issueToken(): Promise<PathaoToken> {
  const response = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PATHAO_CLIENT_ID,
      client_secret: process.env.PATHAO_CLIENT_SECRET,
      grant_type: "password",
      username: process.env.PATHAO_USERNAME,
      password: process.env.PATHAO_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`Pathao auth failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const token: PathaoToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 5400) * 1000,
  };

  await setCache(CACHE_KEYS.PATHAO_TOKEN, token, TTL.PATHAO_TOKEN);
  return token;
}

async function refreshToken(refreshToken: string): Promise<PathaoToken> {
  const response = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PATHAO_CLIENT_ID,
      client_secret: process.env.PATHAO_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    // If refresh fails, issue new token
    return issueToken();
  }

  const data = await response.json();
  const token: PathaoToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 5400) * 1000,
  };

  await setCache(CACHE_KEYS.PATHAO_TOKEN, token, TTL.PATHAO_TOKEN);
  return token;
}

async function getValidToken(): Promise<string> {
  const stored = await getStoredToken();

  if (stored && Date.now() < stored.expires_at - 300_000) {
    // Valid and > 5 min remaining
    return stored.access_token;
  }

  if (stored?.refresh_token) {
    const refreshed = await refreshToken(stored.refresh_token);
    return refreshed.access_token;
  }

  const fresh = await issueToken();
  return fresh.access_token;
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

async function pathaoFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getValidToken();

  const response = await fetch(`${PATHAO_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });

  let currentResponse = response;
  let attempts = 0;
  while (currentResponse.status === 429 && attempts < 5) {
    attempts++;
    // Exponential backoff with random jitter: 1.5s, 3s, 4.5s... + jitter
    const backoff = attempts * 1200 + Math.floor(Math.random() * 600);
    console.warn(`[Pathao API] Rate limited on ${endpoint}. Attempt ${attempts}/5, backing off ${backoff}ms...`);
    await new Promise((resolve) => setTimeout(resolve, backoff));
    currentResponse = await fetch(`${PATHAO_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(options.headers || {}),
      },
    });
  }

  const data = await currentResponse.json();

  if (!currentResponse.ok) {
    console.error("[Pathao API Error response data]:", JSON.stringify(data, null, 2));
    const errorDetails = data?.errors ? JSON.stringify(data.errors) : "";
    throw new Error(
      data?.message ? `${data.message} ${errorDetails}` : `Pathao API error: ${currentResponse.status}`
    );
  }

  return data;
}

// ─── Store Management ─────────────────────────────────────────────────────────

export async function getPathaoStores() {
  const cached = await getCache<any>(CACHE_KEYS.PATHAO_STORES);
  if (cached) return cached;

  const data = await pathaoFetch("/aladdin/api/v1/stores");
  await setCache(CACHE_KEYS.PATHAO_STORES, data, TTL.PATHAO_STORES);
  return data;
}

// ─── Location APIs ────────────────────────────────────────────────────────────

export async function getPathaoCities() {
  const cached = await getCache<any[]>(CACHE_KEYS.PATHAO_CITIES);
  if (cached) return cached;

  const data = await pathaoFetch("/aladdin/api/v1/city-list");
  const cities = data.data?.data || [];
  await setCache(CACHE_KEYS.PATHAO_CITIES, cities, TTL.PATHAO_CITIES);
  return cities;
}

export async function getPathaoZones(cityId: number) {
  const cacheKey = CACHE_KEYS.PATHAO_ZONES(cityId);
  const cached = await getCache<any[]>(cacheKey);
  if (cached) return cached;

  const data = await pathaoFetch(`/aladdin/api/v1/cities/${cityId}/zone-list`);
  const zones = data.data?.data || [];
  await setCache(cacheKey, zones, TTL.PATHAO_ZONES);
  return zones;
}

export async function getPathaoAreas(zoneId: number) {
  const cacheKey = CACHE_KEYS.PATHAO_AREAS(zoneId);
  const cached = await getCache<any[]>(cacheKey);
  if (cached) return cached;

  const data = await pathaoFetch(`/aladdin/api/v1/zones/${zoneId}/area-list`);
  const areas = data.data?.data || [];
  await setCache(cacheKey, areas, TTL.PATHAO_AREAS);
  return areas;
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

export interface PriceParams {
  store_id: number;
  item_type: number;   // 1=Document, 2=Parcel
  delivery_type: number; // 48=Normal, 12=OnDemand
  item_weight: number;
  recipient_city: number;
  recipient_zone: number;
}

export async function getPathaoPrice(params: PriceParams) {
  return pathaoFetch("/aladdin/api/v1/merchant/price-plan", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ─── Order Creation ───────────────────────────────────────────────────────────

export interface PathaoOrderParams {
  store_id: number;
  merchant_order_id: string;  // our internal order ID / Shopify order name
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  recipient_city?: number;
  recipient_zone?: number;
  recipient_area?: number;
  delivery_type: number;      // 48=Normal, 12=OnDemand
  item_type: number;          // 1=Document, 2=Parcel
  special_instruction?: string;
  item_quantity: number;
  item_weight: number;
  amount_to_collect: number;
  item_description?: string;
}

export interface PathaoOrderResponse {
  code: number;
  message: string;
  data: {
    consignment_id: string;
    merchant_order_id: string;
    order_status: string;
    delivery_fee: number;
  };
}

export async function createPathaoOrder(
  params: PathaoOrderParams
): Promise<PathaoOrderResponse> {
  return pathaoFetch("/aladdin/api/v1/orders", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ─── Bulk Order Creation ──────────────────────────────────────────────────────

export async function createBulkPathaoOrders(orders: PathaoOrderParams[]) {
  return pathaoFetch("/aladdin/api/v1/orders/bulk", {
    method: "POST",
    body: JSON.stringify({ orders }),
  });
}

// ─── Order Status ─────────────────────────────────────────────────────────────

export async function getPathaoOrderStatus(consignmentId: string) {
  return pathaoFetch(`/aladdin/api/v1/orders/${consignmentId}/info`);
}

// ─── Cancel Order ─────────────────────────────────────────────────────────────

export async function cancelPathaoOrder(consignmentId: string) {
  return pathaoFetch(`/aladdin/api/v1/orders/${consignmentId}/cancel`, {
    method: "POST",
  });
}

// ─── Test Connection ──────────────────────────────────────────────────────────

export async function testPathaoConnection(): Promise<{
  ok: boolean;
  stores?: any[];
  error?: string;
}> {
  try {
    const data = await getPathaoStores();
    return { ok: true, stores: data.data?.data || [] };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ─── Webhook Verification ─────────────────────────────────────────────────────
import { createHmac, timingSafeEqual } from "crypto";

export function verifyPathaoWebhook(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  try {
    const hash = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");
    return timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}
