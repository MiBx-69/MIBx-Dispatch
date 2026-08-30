import { Redis } from "@upstash/redis";

// Upstash Redis client — works via REST API (no TCP needed, works in Next.js edge/serverless)
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// ─── Cache Keys ──────────────────────────────────────────────────────────────
export const CACHE_KEYS = {
  SHOPIFY_ORDERS: (page: number) => `shopify:orders:page:${page}`,
  PATHAO_CITIES: "pathao:locations:cities",
  PATHAO_ZONES: (cityId: number) => `pathao:locations:zones:${cityId}`,
  PATHAO_AREAS: (zoneId: number) => `pathao:locations:areas:${zoneId}`,
  PATHAO_TOKEN: "pathao:auth:token",
  ORDER_DETAIL: (id: string) => `order:detail:${id}`,
  DASHBOARD_STATS: "dashboard:stats",
  SETTINGS: "app:settings",
} as const;

// ─── TTLs (in seconds) ───────────────────────────────────────────────────────
export const TTL = {
  SHOPIFY_ORDERS: 300,        // 5 minutes
  PATHAO_CITIES: 86400,       // 24 hours
  PATHAO_ZONES: 86400,        // 24 hours
  PATHAO_AREAS: 86400,        // 24 hours
  PATHAO_TOKEN: 3600,         // 1 hour (< actual 1.5h token life)
  ORDER_DETAIL: 60,           // 1 minute
  DASHBOARD_STATS: 120,       // 2 minutes
  SETTINGS: 3600,             // 1 hour
} as const;

// ─── Cache Helpers ────────────────────────────────────────────────────────────
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get<T>(key);
    return data;
  } catch (err) {
    console.error(`[Redis] Cache GET error for ${key}:`, err);
    return null;
  }
}

export async function setCache<T>(
  key: string,
  value: T,
  ttl: number
): Promise<void> {
  try {
    await redis.set(key, value, { ex: ttl });
  } catch (err) {
    console.error(`[Redis] Cache SET error for ${key}:`, err);
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    console.error(`[Redis] Cache DEL error for ${key}:`, err);
  }
}

export async function deleteCachePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    console.error(`[Redis] Cache DEL pattern error for ${pattern}:`, err);
  }
}

/** Rate limiting helper — returns true if request is allowed */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }
    const remaining = Math.max(0, limit - current);
    return { allowed: current <= limit, remaining };
  } catch {
    return { allowed: true, remaining: limit }; // fail open
  }
}
