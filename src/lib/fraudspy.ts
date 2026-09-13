const FRAUDSPY_BASE_URL = "https://fraudspy.com.bd/api/v1";

export interface FraudSpySearchResponse {
  ok: boolean;
  phone: { local: string };
  overall: { total: number; delivered: number; returned: number; success_ratio: number };
  couriers: Record<string, any>;
  fraud_reports: {
    count: number;
    risk: { level: string; score: number };
    reports: any[];
  };
  server_seconds: number;
  message?: string;
}

export interface FraudReportPayload {
  contact_number: string;
  contact_name: string;
  complain_details: string;
  courier_name?: string;
  parcel_id?: string;
  categories?: string[];
  is_anonymous?: boolean;
}

// In-memory fast cache for search results (6 hours TTL)
const fraudMemoryCache = new Map<string, { data: FraudSpySearchResponse; timestamp: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Standardizes BD phone numbers to 11 digits (e.g. 01XXXXXXXXX)
 */
export function normalizePhoneBD(phone: string): string {
  if (!phone) return "";
  let formatted = phone.replace(/\D/g, "");
  if (formatted.startsWith("880")) formatted = formatted.substring(3);
  else if (formatted.startsWith("80")) formatted = formatted.substring(2);
  if (!formatted.startsWith("0") && formatted.length === 10) formatted = "0" + formatted;
  if (formatted.length > 11) formatted = formatted.substring(formatted.length - 11);
  return formatted;
}

/**
 * Perform instant fraud check with in-memory caching and fast timeout guard.
 */
export async function searchFraud(
  phone: string,
  apiKey: string,
  forceRefresh: boolean = false
): Promise<FraudSpySearchResponse | null> {
  if (!apiKey || !phone) return null;

  const formattedPhone = normalizePhoneBD(phone);
  if (!formattedPhone || formattedPhone.length < 10) return null;

  // 1. Return from in-memory cache if available and fresh
  if (!forceRefresh) {
    const cached = fraudMemoryCache.get(formattedPhone);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  // 2. Fetch with 4.5s timeout to prevent UI hanging
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(`${FRAUDSPY_BASE_URL}/search`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ phone: formattedPhone }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json();
    if (!res.ok) {
      console.error("[FraudSpy] Search failed:", data);
      return null;
    }

    if (data && data.ok) {
      fraudMemoryCache.set(formattedPhone, { data, timestamp: Date.now() });
    }

    return data;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      console.warn(`[FraudSpy] Search timed out for phone: ${formattedPhone}`);
    } else {
      console.error("[FraudSpy] Search network error:", error);
    }
    return null;
  }
}

export async function submitFraudReport(payload: FraudReportPayload, apiKey: string) {
  if (!apiKey) throw new Error("FraudSpy API key is missing");

  const res = await fetch(`${FRAUDSPY_BASE_URL}/fraud-report`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      ...payload,
      is_anonymous: payload.is_anonymous ?? false,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Failed to submit fraud report");
  }

  return data;
}

export async function connectSteadfast(steadfastApiKey: string, steadfastSecretKey: string, apiKey: string) {
  if (!apiKey) throw new Error("FraudSpy API key is missing");

  const res = await fetch(`${FRAUDSPY_BASE_URL}/steadfast/connect`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      api_key: steadfastApiKey,
      secret_key: steadfastSecretKey
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || "Failed to connect Steadfast to FraudSpy");
  }

  return data;
}
