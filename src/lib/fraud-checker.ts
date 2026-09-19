import { searchFraud } from "@/lib/fraudspy";
import { updateShopifyCustomer, updateShopifyOrder } from "@/lib/shopify/client";
import { analyzeCustomerRisk, type CustomerRiskAnalysis } from "@/lib/risk-analytics";

export function formatCourierSummary(fraudData: any): string {
  const courierParts: string[] = [];
  if (fraudData?.couriers && typeof fraudData.couriers === "object") {
    for (const [name, stats] of Object.entries(fraudData.couriers as Record<string, any>)) {
      if (stats && (stats.total > 0 || stats.successful > 0 || stats.delivered > 0)) {
        const dlv = stats.successful ?? stats.delivered ?? 0;
        const tot = stats.total ?? (dlv + (stats.returned ?? 0));
        courierParts.push(`${name.toUpperCase()}: ${dlv}/${tot}`);
      }
    }
  }
  return courierParts.length > 0 ? courierParts.join(", ") : "No courier data";
}

export function formatCustomerReportsSummary(fraudData: any): string {
  const reportsCount = fraudData?.fraud_reports?.count || 0;
  if (reportsCount > 0) {
    const reportDetails = fraudData.fraud_reports?.reports?.map((r: any) => 
      `${r.complain_details || r.category || 'Complaint'}`
    ).filter(Boolean).slice(0, 2).join("; ");
    return `${reportsCount} Complaint(s)${reportDetails ? `: ${reportDetails}` : ''}`;
  }
  return "None (Clean Record)";
}

export function buildFraudSpyCustomAttributes(fraudData: any, riskAnalysis: CustomerRiskAnalysis) {
  return [
    { key: "Score", value: `${riskAnalysis.riskScore}/100` },
    { key: "Total Delivered", value: `${fraudData?.overall?.delivered || 0}` },
    { key: "Total Return", value: `${fraudData?.overall?.returned || 0}` }
  ];
}

export function buildFraudSpyCustomerNote(fraudData: any, riskAnalysis: CustomerRiskAnalysis) {
  const delivered = fraudData?.overall?.delivered || 0;
  const returned = fraudData?.overall?.returned || 0;
  return `Score: ${riskAnalysis.riskScore}/100\nTotal Delivered: ${delivered}\nTotal Return: ${returned}`;
}

export function buildDispatchCustomAttributes({
  fraudData,
  riskAnalysis,
}: {
  consignmentId?: string;
  trackingUrl?: string;
  fraudData?: any;
  riskAnalysis?: CustomerRiskAnalysis;
}): Array<{ key: string; value: string }> | undefined {
  // Never add Pathao dispatched ID to additional details (customAttributes).
  // Keep FraudSpy only on additional details.
  if (fraudData) {
    const analysis = riskAnalysis || analyzeCustomerRisk(fraudData);
    return buildFraudSpyCustomAttributes(fraudData, analysis);
  }
  return undefined;
}

export function buildDispatchCombinedNote({
  consignmentId,
  existingNote,
}: {
  consignmentId: string;
  trackingUrl?: string;
  existingNote?: string | null;
  fraudData?: any;
  riskAnalysis?: CustomerRiskAnalysis;
}): string {
  const dispatchHeader = `Pathao Consignment: ${consignmentId}`;

  if (!existingNote || !existingNote.trim()) {
    return dispatchHeader;
  }

  // If existing note already has this exact dispatch ID line, return it as is
  if (existingNote.includes(dispatchHeader)) {
    return existingNote;
  }

  // Remove any previous Pathao Consignment references and duplicate [Order Note] headers
  const cleanedExisting = existingNote
    .replace(/Pathao Consignment:\s*[^\n\r]+/gi, "")
    .replace(/\[Order Note\]/gi, "")
    .trim();

  if (!cleanedExisting) {
    return dispatchHeader;
  }

  return `${dispatchHeader}\n\n[Order Note]\n${cleanedExisting}`;
}

export async function performFraudCheck(
  orderIdentifier: string,
  supabase: any,
  options?: { force?: boolean }
) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderIdentifier);
  
  // 1. Get settings and order
  const [{ data: settings }, { data: order }] = await Promise.all([
    supabase.from("app_settings").select("fraudspy_api_key").single(),
    supabase.from("orders").select("*").eq(isUuid ? "id" : "shopify_order_id", orderIdentifier).single()
  ]);

  if (!settings?.fraudspy_api_key) {
    throw new Error("FraudSpy API key not configured");
  }

  if (!order) {
    throw new Error("Order not found");
  }

  if (!order.customer_phone) {
    throw new Error("Order has no customer phone number");
  }

  // 2. Check cache: order's existing valid fraud_data
  let fraudData = !options?.force && order.fraud_data && (order.fraud_data as any).ok ? order.fraud_data : null;

  // 3. Check cache: any other recent order in DB with same phone number
  if (!fraudData && !options?.force) {
    const { data: recentWithPhone } = await supabase
      .from("orders")
      .select("fraud_data")
      .eq("customer_phone", order.customer_phone)
      .not("fraud_data", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentWithPhone?.fraud_data && (recentWithPhone.fraud_data as any).ok) {
      fraudData = recentWithPhone.fraud_data;
    }
  }

  // 4. Query FraudSpy API (fast with in-memory cache and 4.5s timeout)
  if (!fraudData) {
    fraudData = await searchFraud(order.customer_phone, settings.fraudspy_api_key, options?.force);
  }

  if (!fraudData || !fraudData.ok) {
    throw new Error("Failed to fetch data from FraudSpy");
  }

  // 5. Determine status and score using proportional delivery analytics
  const riskAnalysis = analyzeCustomerRisk(fraudData);
  const fraud_status = riskAnalysis.riskLevel;
  const fraud_score = riskAnalysis.riskScore;

  // 6. Update Supabase Order immediately
  await supabase
    .from("orders")
    .update({
      fraud_status,
      fraud_score,
      fraud_data: fraudData,
      fraud_risk_score: fraud_score,
      fraud_risk_level: fraud_status,
    })
    .eq("id", order.id);

  const tag = `FraudSpy: ${fraud_status === 'fraud' ? 'High Risk' : fraud_status === 'risky' ? 'Medium Risk' : 'Safe'}`;
  const customAttributes = buildFraudSpyCustomAttributes(fraudData, riskAnalysis);
  const customerNote = buildFraudSpyCustomerNote(fraudData, riskAnalysis);

  // 7. Non-blocking Background Sync for Shopify & Audit Logs
  // Allows the API response to return to the UI INSTANTLY (<100ms)
  (async () => {
    try {
      const tasks: Promise<any>[] = [];

      // Update Shopify Customer Profile
      if (order.shopify_customer_id) {
        tasks.push(
          (async () => {
            const { data: customerData } = await supabase
              .from("customers")
              .select("shopify_tags")
              .eq("shopify_customer_id", order.shopify_customer_id)
              .maybeSingle();
            const existingTags = customerData?.shopify_tags || [];
            const mergedTags = Array.from(new Set([...existingTags, tag, 'FraudSpy Verified']));

            return updateShopifyCustomer({
              id: `gid://shopify/Customer/${order.shopify_customer_id}`,
              tags: mergedTags,
              note: customerNote,
            });
          })().catch((err) => console.error("[FraudCheck] Customer sync error (non-fatal):", err))
        );
      }

      // Update Shopify Order Profile (Custom Attributes for "Additional details" & Tags)
      if (order.shopify_order_id) {
        tasks.push(
          updateShopifyOrder({
            id: `gid://shopify/Order/${order.shopify_order_id}`,
            tags: [tag, 'FraudSpy Verified'],
            customAttributes: customAttributes,
          }).catch((err) => console.error("[FraudCheck] Order sync error (non-fatal):", err))
        );
      }

      // Log Audit Event
      tasks.push(
        (async () => {
          const { logOrderEvent } = await import("@/lib/audit");
          return logOrderEvent(
            order.id,
            "FRAUD_CHECK",
            `Fraud Check: ${riskAnalysis.ratingLabel} (${fraud_status.toUpperCase()}, Score: ${fraud_score}) - ${riskAnalysis.recommendation}`,
            fraudData
          );
        })().catch((err) => console.error("[FraudCheck] Audit log error (non-fatal):", err))
      );

      await Promise.allSettled(tasks);
    } catch (bgErr) {
      console.error("[FraudCheck] Background execution error:", bgErr);
    }
  })();

  return { fraud_status, fraud_score, data: fraudData, analysis: riskAnalysis };
}
