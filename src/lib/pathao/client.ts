/**
 * Pathao Merchant API Client
 * Supports token generation, refresh, concurrent refresh mutex, 401 auto-retry,
 * timeout handling, exponential backoff, and single/bulk order creation.
 * Client-safe for pure helpers (formatPathaoTrackingUrl, normalizeBdPhoneForPathao).
 */

import { CACHE_KEYS, TTL, getCache, setCache, invalidateCache } from "@/lib/redis";
import { createHmac, timingSafeEqual } from "crypto";

const DEFAULT_PATHAO_BASE_URL = "https://api-hermes.pathao.com";
const DEFAULT_TIMEOUT_MS = 15_000;

export interface PathaoCredentials {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  webhookSecret?: string | null;
}

// ─── Token Management & Concurrency Mutex ─────────────────────────────────────

export interface PathaoToken {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix ms
}

let memoryTokenCache: PathaoToken | null = null;
let inFlightTokenPromise: Promise<string> | null = null;

/**
 * Resolves Pathao credentials from environment variables first, with fallback to Supabase app_settings.
 * Uses @supabase/supabase-js directly on the server to avoid importing next/headers.
 */
export async function getPathaoCredentials(): Promise<PathaoCredentials> {
  const envClientId = process.env.PATHAO_CLIENT_ID?.trim();
  const envClientSecret = process.env.PATHAO_CLIENT_SECRET?.trim();
  const envUsername = process.env.PATHAO_USERNAME?.trim();
  const envPassword = process.env.PATHAO_PASSWORD?.trim();
  const envBaseUrl = (process.env.PATHAO_BASE_URL || DEFAULT_PATHAO_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
  const envWebhookSecret = process.env.PATHAO_WEBHOOK_SECRET?.trim() || null;

  if (envClientId && envClientSecret && envUsername && envPassword) {
    return {
      baseUrl: envBaseUrl,
      clientId: envClientId,
      clientSecret: envClientSecret,
      username: envUsername,
      password: envPassword,
      webhookSecret: envWebhookSecret,
    };
  }

  // Fallback to Supabase app_settings if running on server
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseServiceKey) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: settings } = await supabase
        .from("app_settings")
        .select(
          "pathao_base_url, pathao_client_id, pathao_client_secret, pathao_username, pathao_password, pathao_webhook_secret"
        )
        .limit(1)
        .maybeSingle();

      if (settings) {
        return {
          baseUrl: (
            settings.pathao_base_url ||
            envBaseUrl ||
            DEFAULT_PATHAO_BASE_URL
          )
            .trim()
            .replace(/\/+$/, ""),
          clientId: (settings.pathao_client_id || envClientId || "").trim(),
          clientSecret: (
            settings.pathao_client_secret ||
            envClientSecret ||
            ""
          ).trim(),
          username: (settings.pathao_username || envUsername || "").trim(),
          password: (settings.pathao_password || envPassword || "").trim(),
          webhookSecret:
            settings.pathao_webhook_secret?.trim() || envWebhookSecret,
        };
      }
    } catch {
      // Fall through to env values
    }
  }

  return {
    baseUrl: envBaseUrl,
    clientId: envClientId || "",
    clientSecret: envClientSecret || "",
    username: envUsername || "",
    password: envPassword || "",
    webhookSecret: envWebhookSecret,
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: options.signal || controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getStoredToken(): Promise<PathaoToken | null> {
  const cached = await getCache<PathaoToken>(CACHE_KEYS.PATHAO_TOKEN);
  if (cached && cached.access_token) {
    memoryTokenCache = cached;
    return cached;
  }
  return memoryTokenCache;
}

async function saveStoredToken(token: PathaoToken): Promise<void> {
  memoryTokenCache = token;
  await setCache(CACHE_KEYS.PATHAO_TOKEN, token, TTL.PATHAO_TOKEN);
}

export async function clearStoredPathaoToken(): Promise<void> {
  memoryTokenCache = null;
  await invalidateCache(CACHE_KEYS.PATHAO_TOKEN);
}

async function issueToken(creds?: PathaoCredentials): Promise<PathaoToken> {
  const resolved = creds || (await getPathaoCredentials());
  const response = await fetchWithTimeout(
    `${resolved.baseUrl}/aladdin/api/v1/issue-token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: resolved.clientId,
        client_secret: resolved.clientSecret,
        grant_type: "password",
        username: resolved.username,
        password: resolved.password,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `Pathao auth failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const token: PathaoToken = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (Number(data.expires_in) || 5400) * 1000,
  };

  await saveStoredToken(token);
  return token;
}

async function refreshToken(
  refreshTokenStr: string,
  creds?: PathaoCredentials
): Promise<PathaoToken> {
  const resolved = creds || (await getPathaoCredentials());
  try {
    const response = await fetchWithTimeout(
      `${resolved.baseUrl}/aladdin/api/v1/issue-token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: resolved.clientId,
          client_secret: resolved.clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshTokenStr,
        }),
      }
    );

    if (!response.ok) {
      return issueToken(resolved);
    }

    const data = await response.json();
    const token: PathaoToken = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshTokenStr,
      expires_at: Date.now() + (Number(data.expires_in) || 5400) * 1000,
    };

    await saveStoredToken(token);
    return token;
  } catch {
    return issueToken(resolved);
  }
}

/**
 * Returns a valid Pathao access token, refreshing 5 minutes before expiry
 * and deduplicating concurrent refresh/issue requests via an in-memory mutex.
 */
export async function getValidToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const stored = await getStoredToken();
    if (stored && Date.now() < stored.expires_at - 300_000) {
      return stored.access_token;
    }
  }

  if (inFlightTokenPromise) {
    return inFlightTokenPromise;
  }

  inFlightTokenPromise = (async () => {
    try {
      const creds = await getPathaoCredentials();
      const stored = await getStoredToken();
      if (!forceRefresh && stored && Date.now() < stored.expires_at - 300_000) {
        return stored.access_token;
      }
      if (stored?.refresh_token) {
        const refreshed = await refreshToken(stored.refresh_token, creds);
        return refreshed.access_token;
      }
      const fresh = await issueToken(creds);
      return fresh.access_token;
    } finally {
      inFlightTokenPromise = null;
    }
  })();

  return inFlightTokenPromise;
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

async function pathaoFetch<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const creds = await getPathaoCredentials();
  let token = await getValidToken(false);

  const executeRequest = async (bearerToken: string) => {
    return fetchWithTimeout(`${creds.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${bearerToken}`,
        ...(options.headers || {}),
      },
    });
  };

  let currentResponse = await executeRequest(token);

  // Automatic 1-time token refresh + retry on 401 authentication failure
  if (currentResponse.status === 401) {
    await clearStoredPathaoToken();
    token = await getValidToken(true);
    currentResponse = await executeRequest(token);
  }

  // Exponential backoff retry for 429 rate-limit or 502/503/504 transient errors
  let attempts = 0;
  while (
    (currentResponse.status === 429 ||
      currentResponse.status === 502 ||
      currentResponse.status === 503 ||
      currentResponse.status === 504) &&
    attempts < 4
  ) {
    attempts++;
    const backoff = attempts * 1000 + Math.floor(Math.random() * 400);
    console.warn(
      `[Pathao API] Transient ${currentResponse.status} on ${endpoint}. Attempt ${attempts}/4, backing off ${backoff}ms...`
    );
    await new Promise((resolve) => setTimeout(resolve, backoff));
    currentResponse = await executeRequest(token);
  }

  let data: any = null;
  try {
    data = await currentResponse.json();
  } catch {
    data = null;
  }

  if (!currentResponse.ok) {
    const errorDetails = data?.errors ? JSON.stringify(data.errors) : "";
    throw new Error(
      data?.message
        ? `${data.message} ${errorDetails}`.trim()
        : `Pathao API error: ${currentResponse.status}`
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
  item_type: number; // 1=Document, 2=Parcel
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

// ─── Order Creation & Validation ──────────────────────────────────────────────

export interface PathaoOrderParams {
  store_id: number;
  merchant_order_id: string; // our internal order ID / Shopify order name
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  recipient_city?: number;
  recipient_zone?: number;
  recipient_area?: number;
  delivery_type: number; // 48=Normal, 12=OnDemand
  item_type: number; // 1=Document, 2=Parcel
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

/**
 * Validates required Pathao order fields before API submission.
 */
export function validatePathaoOrderPayload(params: PathaoOrderParams): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  if (!params.store_id || Number(params.store_id) <= 0) {
    errors.push("store_id is required");
  }
  if (!params.recipient_name || params.recipient_name.trim().length < 2) {
    errors.push("recipient_name is required (min 2 chars)");
  }
  if (!params.recipient_phone || params.recipient_phone.trim().length < 10) {
    errors.push("recipient_phone is required");
  }
  if (!params.recipient_address || params.recipient_address.trim().length < 10) {
    errors.push("recipient_address must be at least 10 characters");
  }
  if (!params.delivery_type) {
    errors.push("delivery_type is required (48=Normal, 12=OnDemand)");
  }
  if (!params.item_type) {
    errors.push("item_type is required (1=Document, 2=Parcel)");
  }
  if (!params.item_quantity || Number(params.item_quantity) < 1) {
    errors.push("item_quantity must be >= 1");
  }
  if (!params.item_weight || Number(params.item_weight) <= 0) {
    errors.push("item_weight must be > 0");
  }
  if (
    params.amount_to_collect === undefined ||
    params.amount_to_collect === null ||
    Number(params.amount_to_collect) < 0
  ) {
    errors.push("amount_to_collect must be >= 0");
  }
  return { valid: errors.length === 0, errors };
}

export async function createPathaoOrder(
  params: PathaoOrderParams
): Promise<PathaoOrderResponse> {
  const validation = validatePathaoOrderPayload(params);
  if (!validation.valid) {
    throw new Error(
      `Invalid Pathao order payload: ${validation.errors.join(", ")}`
    );
  }
  return pathaoFetch("/aladdin/api/v1/orders", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

// ─── Bulk Order Creation ──────────────────────────────────────────────────────

export interface PathaoBulkOrderResponse {
  code: number;
  message: string;
  accepted_async: boolean;
  data?: any;
}

/**
 * Submits bulk orders to POST /aladdin/api/v1/orders/bulk.
 * Pathao's bulk endpoint returns HTTP 202 (Accepted) when queued asynchronously,
 * delivering individual consignment_ids later via `order.created` webhooks.
 */
export async function createBulkPathaoOrders(
  orders: PathaoOrderParams[]
): Promise<PathaoBulkOrderResponse> {
  if (!Array.isArray(orders) || orders.length === 0) {
    throw new Error("Bulk Pathao order list cannot be empty");
  }

  for (let i = 0; i < orders.length; i++) {
    const check = validatePathaoOrderPayload(orders[i]);
    if (!check.valid) {
      throw new Error(
        `Order #${i + 1} (${orders[i].merchant_order_id || "unknown"}) invalid: ${check.errors.join(", ")}`
      );
    }
  }

  const creds = await getPathaoCredentials();
  let token = await getValidToken(false);

  let res = await fetchWithTimeout(`${creds.baseUrl}/aladdin/api/v1/orders/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ orders }),
  });

  if (res.status === 401) {
    await clearStoredPathaoToken();
    token = await getValidToken(true);
    res = await fetchWithTimeout(`${creds.baseUrl}/aladdin/api/v1/orders/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ orders }),
    });
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const errorDetails = data?.errors ? JSON.stringify(data.errors) : "";
    throw new Error(
      data?.message
        ? `${data.message} ${errorDetails}`.trim()
        : `Pathao Bulk API error: ${res.status}`
    );
  }

  const hasImmediateConsignments = Array.isArray(data?.data)
    ? data.data.some((d: any) => Boolean(d?.consignment_id))
    : Boolean(data?.data?.consignment_id);

  return {
    code: data?.code ?? res.status,
    message:
      data?.message ||
      (res.status === 202
        ? "Bulk orders accepted asynchronously by Pathao; awaiting order.created webhooks."
        : "Bulk orders submitted."),
    accepted_async: res.status === 202 && !hasImmediateConsignments,
    data: data?.data ?? null,
  };
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

/**
 * Verifies a Pathao webhook request using constant-time comparison.
 * Supports:
 * 1. Direct secret match in `X-PATHAO-Signature` or `X-Pathao-Merchant-Webhook-Integration-Secret`
 * 2. HMAC-SHA256 hex digest match in `X-PATHAO-Signature`
 */
export function verifyPathaoWebhook(
  rawBody: string,
  incomingSignatureOrSecret: string,
  configuredSecret: string
): boolean {
  try {
    if (!incomingSignatureOrSecret || !configuredSecret) return false;
    const cleanIncoming = incomingSignatureOrSecret
      .replace(/^Bearer\s+/i, "")
      .trim();
    const cleanExpected = configuredSecret.trim();

    if (!cleanIncoming || !cleanExpected) return false;

    // 1. Direct secret comparison (constant-time)
    const incomingBuf = Buffer.from(cleanIncoming, "utf8");
    const expectedBuf = Buffer.from(cleanExpected, "utf8");
    if (
      incomingBuf.length === expectedBuf.length &&
      timingSafeEqual(incomingBuf, expectedBuf)
    ) {
      return true;
    }

    // 2. HMAC-SHA256 signature comparison (constant-time)
    const hmacHex = createHmac("sha256", cleanExpected)
      .update(rawBody, "utf8")
      .digest("hex");
    const hmacBuf = Buffer.from(hmacHex, "utf8");
    if (
      incomingBuf.length === hmacBuf.length &&
      timingSafeEqual(incomingBuf, hmacBuf)
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// ─── Tracking Link Generation ────────────────────────────────────────────────

/**
 * Normalizes a Bangladeshi phone number to the 11-digit BD national format (e.g. "01XXXXXXXXX").
 * Pathao tracking requires the national format starting with 0 (total 11 digits),
 * NOT the international +880 format.
 */
export function normalizeBdPhoneForPathao(phone?: string | null): string {
  if (!phone) return "";
  let str = phone;
  try {
    str = decodeURIComponent(phone);
  } catch {}
  let digits = str.replace(/\D/g, "");
  if (!digits) return "";

  // Strip international prefix if present
  if (digits.startsWith("880")) {
    digits = digits.slice(2); // "88017..." -> "017..."
  } else if (digits.startsWith("80")) {
    digits = "0" + digits.slice(2);
  } else if (!digits.startsWith("0") && digits.length === 10 && digits.startsWith("1")) {
    digits = "0" + digits; // "17..." -> "017..."
  }

  // Ensure exactly 11 digits starting with 01 if a standard BD mobile number was embedded
  if (digits.length > 11 && digits.includes("01")) {
    const idx = digits.lastIndexOf("01");
    if (idx !== -1 && digits.length - idx >= 11) {
      digits = digits.slice(idx, idx + 11);
    }
  }

  return digits;
}

/**
 * Builds the official Pathao live parcel tracking URL with consignment_id and BD national 11-digit phone:
 * https://merchant.pathao.com/tracking?consignment_id=DU171026QMF76R&phone=01712200891
 */
export function formatPathaoTrackingUrl(
  consignmentId?: string | null,
  phone?: string | null
): string {
  if (!consignmentId) return "";
  const normalizedPhone = normalizeBdPhoneForPathao(phone);
  if (normalizedPhone) {
    return `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(consignmentId)}&phone=${encodeURIComponent(normalizedPhone)}`;
  }
  return `https://merchant.pathao.com/tracking?consignment_id=${encodeURIComponent(consignmentId)}`;
}

/**
 * Sanitizes an existing Pathao tracking URL so its phone parameter uses the
 * 11-digit BD national format (01XXXXXXXXX), stripping +88 / %2B88 / 880.
 */
export function cleanPathaoTrackingUrl(url?: string | null): string {
  if (!url) return "";
  if (!url.includes("merchant.pathao.com/tracking")) return url;
  try {
    const parsed = new URL(url);
    const consignmentId = parsed.searchParams.get("consignment_id");
    const rawPhone = parsed.searchParams.get("phone");
    if (!consignmentId) return url;
    return formatPathaoTrackingUrl(consignmentId, rawPhone);
  } catch {
    return url;
  }
}
