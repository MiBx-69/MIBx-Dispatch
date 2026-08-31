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

export async function searchFraud(phone: string, apiKey: string): Promise<FraudSpySearchResponse | null> {
  if (!apiKey || !phone) return null;

  try {
    let formattedPhone = phone.replace(/\D/g, "");
    if (formattedPhone.startsWith("880")) {
      formattedPhone = formattedPhone.substring(2);
    } else if (formattedPhone.startsWith("1")) {
      formattedPhone = "0" + formattedPhone;
    }

    const res = await fetch(`${FRAUDSPY_BASE_URL}/search`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ phone: formattedPhone }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[FraudSpy] Search failed:", data);
      return null;
    }

    return data;
  } catch (error) {
    console.error("[FraudSpy] Search network error:", error);
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
