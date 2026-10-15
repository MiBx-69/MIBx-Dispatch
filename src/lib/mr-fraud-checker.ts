const MR_FRAUD_CHECKER_BASE_URL = "https://fraudchecker.ocs-api.top/api/v3";

export interface MrFraudCheckerCourierData {
  success: number;
  cancel: number;
  total: number;
  deliveredPercentage: number;
  returnPercentage: number;
}

export interface MrFraudCheckerCourierEntry {
  status: boolean;
  message: string;
  data: MrFraudCheckerCourierData;
}

export interface MrFraudCheckerResponse {
  ok: boolean; // normalized — true if API call succeeded
  phone: string;
  status: string; // "Safe" etc.
  score: number; // their raw score: 100 = Safe (we invert internally)
  risk_score: number; // our internal risk score: 0 = Safe, 100 = Fraud (inverted)
  total_parcel: number;
  success_parcel: number;
  cancel_parcel: number;
  response: {
    steadfast?: MrFraudCheckerCourierEntry;
    pathao?: MrFraudCheckerCourierEntry;
    redx?: MrFraudCheckerCourierEntry;
    carrybee?: MrFraudCheckerCourierEntry;
    [key: string]: MrFraudCheckerCourierEntry | undefined;
  };
  source?: string;
  error?: string;
}

// In-memory fast cache for results (6 hours TTL — mirrors fraudspy.ts)
const mrFraudMemoryCache = new Map<string, { data: MrFraudCheckerResponse; timestamp: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Inverts Mr. Fraud Checker's score (100 = Safe) to our internal risk scale (0 = Safe).
 * Their score represents "safety", ours represents "risk".
 */
export function invertMrFraudScore(safetyScore: number): number {
  const clamped = Math.max(0, Math.min(100, safetyScore));
  return Math.round(100 - clamped);
}

/**
 * Call Mr. Fraud Checker API for a given BD phone number.
 * Uses in-memory caching with 6h TTL and a 4.5s timeout guard.
 */
export async function checkMrFraud(
  phone: string,
  apiKey: string,
  forceRefresh: boolean = false
): Promise<MrFraudCheckerResponse | null> {
  if (!apiKey || !phone) return null;

  // Normalize phone: strip non-digits, ensure 11-digit BD format
  let formattedPhone = phone.replace(/\D/g, "");
  if (formattedPhone.startsWith("880")) formattedPhone = formattedPhone.substring(3);
  else if (formattedPhone.startsWith("80")) formattedPhone = formattedPhone.substring(2);
  if (!formattedPhone.startsWith("0") && formattedPhone.length === 10) formattedPhone = "0" + formattedPhone;
  if (formattedPhone.length > 11) formattedPhone = formattedPhone.substring(formattedPhone.length - 11);

  if (!formattedPhone || formattedPhone.length < 10) return null;

  // 1. Return from in-memory cache if fresh
  if (!forceRefresh) {
    const cached = mrFraudMemoryCache.get(formattedPhone);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // 2. Fetch with 4.5s timeout
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const url = new URL(MR_FRAUD_CHECKER_BASE_URL);
    url.searchParams.set("phone", formattedPhone);
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error(`[MrFraudChecker] API error ${res.status}:`, errBody);
      return null;
    }

    const raw = await res.json();

    // Normalize: add our internal fields
    const result: MrFraudCheckerResponse = {
      ok: true,
      phone: raw.phone ?? formattedPhone,
      status: raw.status ?? "Unknown",
      score: raw.score ?? 0,
      risk_score: invertMrFraudScore(raw.score ?? 0),
      total_parcel: raw.total_parcel ?? 0,
      success_parcel: raw.success_parcel ?? 0,
      cancel_parcel: raw.cancel_parcel ?? 0,
      response: raw.response ?? {},
      source: raw.source,
    };

    mrFraudMemoryCache.set(formattedPhone, { data: result, timestamp: Date.now() });
    return result;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      console.warn(`[MrFraudChecker] Request timed out for phone: ${formattedPhone}`);
    } else {
      console.error("[MrFraudChecker] Network error:", error);
    }
    return null;
  }
}

/**
 * Merge Mr. Fraud Checker courier data into a unified courier map
 * compatible with our existing risk-analytics engine.
 * Only couriers with actual data (total > 0) are included.
 */
export function extractMrFraudCourierSummary(data: MrFraudCheckerResponse): string {
  const parts: string[] = [];
  for (const [name, entry] of Object.entries(data.response)) {
    if (entry?.status && entry.data.total > 0) {
      parts.push(
        `${name.toUpperCase()}: ${entry.data.success}/${entry.data.total} (${entry.data.deliveredPercentage}% DLV)`
      );
    }
  }
  return parts.length > 0 ? parts.join(", ") : "No courier data";
}
