import { searchFraud } from "@/lib/fraudspy";
import { checkMrFraud, type MrFraudCheckerResponse } from "@/lib/mr-fraud-checker";
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
  mrFraudData,
}: {
  consignmentId?: string;
  trackingUrl?: string;
  fraudData?: any;
  mrFraudData?: MrFraudCheckerResponse | null;
  riskAnalysis?: CustomerRiskAnalysis;
}): Array<{ key: string; value: string }> | undefined {
  // Never add Pathao dispatched ID to additional details (customAttributes).
  // Keep FraudSpy only on additional details.
  if (fraudData || mrFraudData) {
    const analysis = riskAnalysis || (fraudData ? analyzeCustomerRisk(fraudData) : null);
    const attrs: Array<{ key: string; value: string }> = [];
    if (analysis) {
      attrs.push(...buildFraudSpyCustomAttributes(fraudData || {}, analysis));
    }
    if (mrFraudData) {
      attrs.push(
        { key: "MrFraud Status", value: mrFraudData.status },
        { key: "MrFraud Delivered", value: mrFraudData.success_parcel.toString() },
        { key: "MrFraud Returned", value: mrFraudData.cancel_parcel.toString() },
      );
    }
    return attrs.length > 0 ? attrs : undefined;
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
    supabase.from("app_settings").select("fraud_check_enabled, fraudspy_api_key, mr_fraud_checker_enabled, mr_fraud_checker_api_key").single(),
    supabase.from("orders").select("*").eq(isUuid ? "id" : "shopify_order_id", orderIdentifier).single()
  ]);

  const isFraudSpyActive = Boolean(settings?.fraud_check_enabled && settings?.fraudspy_api_key);
  const isMrFraudActive = Boolean(settings?.mr_fraud_checker_enabled && settings?.mr_fraud_checker_api_key);

  if (!isFraudSpyActive && !isMrFraudActive) {
    throw new Error("No fraud detection providers are currently enabled. Enable FraudSpy or Mr. Fraud Checker in Settings.");
  }

  if (!order) {
    throw new Error("Order not found");
  }

  if (!order.customer_phone) {
    throw new Error("Order has no customer phone number");
  }

  // 2. Check cache: order's existing valid data for ACTIVE providers
  let fraudData = isFraudSpyActive && !options?.force && order.fraud_data && (order.fraud_data as any).ok ? order.fraud_data : null;
  let mrFraudData: MrFraudCheckerResponse | null =
    isMrFraudActive && !options?.force && order.mr_fraud_data && (order.mr_fraud_data as any).ok
      ? (order.mr_fraud_data as MrFraudCheckerResponse)
      : null;

  // 3. Check cache: any other recent order in DB with same phone number
  if (((isFraudSpyActive && !fraudData) || (isMrFraudActive && !mrFraudData)) && !options?.force) {
    const { data: recentWithPhone } = await supabase
      .from("orders")
      .select("fraud_data, mr_fraud_data")
      .eq("customer_phone", order.customer_phone)
      .not("fraud_data", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (isFraudSpyActive && !fraudData && recentWithPhone?.fraud_data && (recentWithPhone.fraud_data as any).ok) {
      fraudData = recentWithPhone.fraud_data;
    }
    if (isMrFraudActive && !mrFraudData && recentWithPhone?.mr_fraud_data && (recentWithPhone.mr_fraud_data as any).ok) {
      mrFraudData = recentWithPhone.mr_fraud_data as MrFraudCheckerResponse;
    }
  }

  // 4. Query APIs in parallel — only for active providers that need fresh data
  const shouldFetchFraudSpy = isFraudSpyActive && !fraudData;
  const shouldFetchMrFraud = isMrFraudActive && !mrFraudData;

  if (shouldFetchFraudSpy || shouldFetchMrFraud) {
    const [fraudSpyResult, mrFraudResult] = await Promise.allSettled([
      shouldFetchFraudSpy
        ? searchFraud(order.customer_phone, settings.fraudspy_api_key!, options?.force)
        : Promise.resolve(null),
      shouldFetchMrFraud
        ? checkMrFraud(order.customer_phone, settings.mr_fraud_checker_api_key!, options?.force)
        : Promise.resolve(null),
    ]);

    if (fraudSpyResult.status === "fulfilled" && fraudSpyResult.value?.ok) {
      fraudData = fraudSpyResult.value;
    } else if (fraudSpyResult.status === "rejected") {
      console.error("[FraudCheck] FraudSpy fetch failed:", fraudSpyResult.reason);
    }

    if (mrFraudResult.status === "fulfilled" && mrFraudResult.value?.ok) {
      mrFraudData = mrFraudResult.value;
    } else if (mrFraudResult.status === "rejected") {
      console.error("[FraudCheck] MrFraudChecker fetch failed:", mrFraudResult.reason);
    }
  }

  if (!fraudData && !mrFraudData) {
    throw new Error("Failed to fetch data from any fraud provider");
  }

  // 5. Determine combined risk using primary source (FraudSpy preferred, fallback to MrFraud)
  let riskAnalysis: CustomerRiskAnalysis;
  if (fraudData?.ok) {
    riskAnalysis = analyzeCustomerRisk(fraudData);
  } else {
    // Derive FraudSpy-compatible shape from Mr. Fraud Checker data for the risk engine
    riskAnalysis = analyzeCustomerRisk({
      overall: {
        total: mrFraudData!.total_parcel,
        delivered: mrFraudData!.success_parcel,
        returned: mrFraudData!.cancel_parcel,
        success_ratio: mrFraudData!.total_parcel > 0
          ? Math.round((mrFraudData!.success_parcel / mrFraudData!.total_parcel) * 100)
          : 0,
      },
      fraud_reports: { count: 0, risk: { level: "low", score: 0 }, reports: [] },
      ok: true,
    });
  }

  // When both sources available, take the worse (higher-risk) score as the combined result
  if (fraudData?.ok && mrFraudData?.ok) {
    const mrRisk = analyzeCustomerRisk({
      overall: {
        total: mrFraudData.total_parcel,
        delivered: mrFraudData.success_parcel,
        returned: mrFraudData.cancel_parcel,
        success_ratio: mrFraudData.total_parcel > 0
          ? Math.round((mrFraudData.success_parcel / mrFraudData.total_parcel) * 100)
          : 0,
      },
      fraud_reports: { count: 0, risk: { level: "low", score: 0 }, reports: [] },
      ok: true,
    });

    // Combined score = weighted average, biased toward worse outcome
    const combinedScore = Math.round((riskAnalysis.riskScore * 0.6) + (mrRisk.riskScore * 0.4));
    const combinedLevel =
      combinedScore >= 70 ? "fraud" : combinedScore >= 35 ? "risky" : "safe";

    // Only upgrade risk (never downgrade)
    if (combinedScore > riskAnalysis.riskScore) {
      riskAnalysis = { ...riskAnalysis, riskScore: combinedScore, riskLevel: combinedLevel };
    }
  }

  const fraud_status = riskAnalysis.riskLevel;
  const fraud_score = riskAnalysis.riskScore;

  // 6. Update Supabase Order immediately
  await supabase
    .from("orders")
    .update({
      fraud_status,
      fraud_score,
      fraud_data: fraudData ?? order.fraud_data,
      mr_fraud_data: mrFraudData ?? order.mr_fraud_data,
      fraud_risk_score: fraud_score,
      fraud_risk_level: fraud_status,
    })
    .eq("id", order.id);

  // Build provider attribution string for Shopify tags
  const providerParts: string[] = [];
  if (fraudData?.ok) providerParts.push("FraudSpy");
  if (mrFraudData?.ok) providerParts.push("MrFraud");
  const providerTag = providerParts.join("+") || "FraudSpy";

  const riskLabel = fraud_status === "fraud" ? "High Risk" : fraud_status === "risky" ? "Medium Risk" : "Safe";
  const tag = `${providerTag}: ${riskLabel}`;
  const verifiedTag = providerParts.length > 1 ? "Fraud Checked" : `${providerTag} Verified`;

  const customAttributes = buildFraudSpyCustomAttributes(fraudData || {}, riskAnalysis);
  if (mrFraudData?.ok) {
    customAttributes.push(
      { key: "MrFraud Status", value: mrFraudData.status },
      { key: "MrFraud Delivered", value: mrFraudData.success_parcel.toString() },
      { key: "MrFraud Returned", value: mrFraudData.cancel_parcel.toString() },
    );
  }
  const customerNote = fraudData?.ok
    ? buildFraudSpyCustomerNote(fraudData, riskAnalysis)
    : `Score: ${fraud_score}/100\nMrFraud: ${mrFraudData?.status} (Del: ${mrFraudData?.success_parcel}, Ret: ${mrFraudData?.cancel_parcel})`;

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
            const mergedTags = Array.from(new Set([...existingTags, tag, verifiedTag]));

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
            tags: [tag, verifiedTag],
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
            `Fraud Check [${providerTag}]: ${riskAnalysis.ratingLabel} (${fraud_status.toUpperCase()}, Score: ${fraud_score}) - ${riskAnalysis.recommendation}`,
            { fraudspy: fraudData, mrFraudChecker: mrFraudData }
          );
        })().catch((err) => console.error("[FraudCheck] Audit log error (non-fatal):", err))
      );

      await Promise.allSettled(tasks);
    } catch (bgErr) {
      console.error("[FraudCheck] Background execution error:", bgErr);
    }
  })();

  return { fraud_status, fraud_score, data: fraudData, mrFraudData, analysis: riskAnalysis };
}
