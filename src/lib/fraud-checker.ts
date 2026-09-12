import { searchFraud } from "@/lib/fraudspy";
import { updateShopifyCustomer, updateShopifyOrder } from "@/lib/shopify/client";
import { analyzeCustomerRisk, type CustomerRiskAnalysis } from "@/lib/risk-analytics";

export function buildFraudSpyCustomAttributes(fraudData: any, riskAnalysis: CustomerRiskAnalysis) {
  const overall = fraudData.overall || {};
  const delivered = Number(overall.delivered || 0);
  const returned = Number(overall.returned || 0);
  const total = Number(overall.total || (delivered + returned));
  const successRatio = riskAnalysis.successRatio;
  const returnRatio = riskAnalysis.returnRatio;
  const reportsCount = fraudData.fraud_reports?.count || 0;

  // Format courier breakdown string e.g. STEADFAST: 10/10, PATHAO: 4/5
  const courierParts: string[] = [];
  if (fraudData.couriers && typeof fraudData.couriers === "object") {
    for (const [name, stats] of Object.entries(fraudData.couriers as Record<string, any>)) {
      if (stats && (stats.total > 0 || stats.successful > 0 || stats.delivered > 0)) {
        const dlv = stats.successful ?? stats.delivered ?? 0;
        const tot = stats.total ?? (dlv + (stats.returned ?? 0));
        courierParts.push(`${name.toUpperCase()}: ${dlv}/${tot}`);
      }
    }
  }
  const couriersSummary = courierParts.length > 0 ? courierParts.join(", ") : "No courier data";

  // Format customer complaints summary
  let customerReportSummary = "None (Clean Record)";
  if (reportsCount > 0) {
    const reportDetails = fraudData.fraud_reports?.reports?.map((r: any) => 
      `${r.complain_details || r.category || 'Complaint'}`
    ).filter(Boolean).slice(0, 2).join("; ");
    customerReportSummary = `${reportsCount} Complaint(s)${reportDetails ? `: ${reportDetails}` : ''}`;
  }

  return [
    { key: "FraudSpy Status", value: riskAnalysis.riskLevel.toUpperCase() },
    { key: "FraudSpy Score", value: riskAnalysis.riskScore.toString() },
    { key: "FraudSpy Rating", value: riskAnalysis.ratingLabel },
    { key: "FraudSpy Total Parcels", value: total.toString() },
    { key: "FraudSpy Delivered", value: delivered.toString() },
    { key: "FraudSpy Returned", value: returned.toString() },
    { key: "FraudSpy Success Ratio", value: `${successRatio}%` },
    { key: "FraudSpy Return Ratio", value: `${returnRatio}%` },
    { key: "FraudSpy Customer Reports", value: customerReportSummary },
    { key: "FraudSpy Couriers", value: couriersSummary },
    { key: "FraudSpy Recommendation", value: riskAnalysis.recommendation },
    { key: "FraudSpy Last Checked", value: new Date().toLocaleString() }
  ];
}

export function buildFraudSpyCustomerNote(fraudData: any, riskAnalysis: CustomerRiskAnalysis) {
  const reportsCount = fraudData.fraud_reports?.count || 0;
  return `[FraudSpy Assessment]
Status: ${riskAnalysis.riskLevel.toUpperCase()} (Score: ${riskAnalysis.riskScore}/100) - ${riskAnalysis.ratingLabel}
Delivery Rate: ${riskAnalysis.successRatio}% (${fraudData.overall?.delivered || 0} delivered, ${fraudData.overall?.returned || 0} returned of ${fraudData.overall?.total || 0} total)
Merchant Reports: ${reportsCount > 0 ? `${reportsCount} complaint(s) filed` : 'Clean record (0 complaints)'}
Recommendation: ${riskAnalysis.recommendation}
Checked: ${new Date().toLocaleString()}`;
}

export async function performFraudCheck(orderIdentifier: string, supabase: any) {
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

  // 2. Query FraudSpy
  const fraudData = await searchFraud(order.customer_phone, settings.fraudspy_api_key);
  if (!fraudData || !fraudData.ok) {
    throw new Error("Failed to fetch data from FraudSpy");
  }

  // 3. Determine status and score using proportional delivery analytics
  const riskAnalysis = analyzeCustomerRisk(fraudData);
  const fraud_status = riskAnalysis.riskLevel;
  const fraud_score = riskAnalysis.riskScore;

  // 4. Update Supabase Order
  await supabase
    .from("orders")
    .update({
      fraud_status,
      fraud_score,
      fraud_data: fraudData
    })
    .eq("id", order.id);

  const tag = `FraudSpy: ${fraud_status === 'fraud' ? 'High Risk' : fraud_status === 'risky' ? 'Medium Risk' : 'Safe'}`;
  const customAttributes = buildFraudSpyCustomAttributes(fraudData, riskAnalysis);
  const customerNote = buildFraudSpyCustomerNote(fraudData, riskAnalysis);

  // 5. Update Shopify Customer Profile (Tags & Note)
  if (order.shopify_customer_id) {
    try {
      const { data: customerData } = await supabase.from("customers").select("shopify_tags").eq("shopify_id", order.shopify_customer_id).single();
      const existingTags = customerData?.shopify_tags || [];
      const mergedTags = Array.from(new Set([...existingTags, tag, 'FraudSpy Verified']));

      await updateShopifyCustomer({
        id: `gid://shopify/Customer/${order.shopify_customer_id}`,
        tags: mergedTags,
        note: customerNote,
      });
    } catch (shopifyError) {
      console.error("Failed to update Shopify customer profile:", shopifyError);
    }
  }

  // 6. Update Shopify Order Profile (Custom Attributes & Tags)
  if (order.shopify_order_id) {
    try {
      await updateShopifyOrder({
        id: `gid://shopify/Order/${order.shopify_order_id}`,
        tags: [tag, 'FraudSpy Verified'],
        customAttributes: customAttributes,
      });
    } catch (shopifyError) {
      console.error("Failed to update Shopify order:", shopifyError);
    }
  }

  const { logOrderEvent } = await import("@/lib/audit");
  await logOrderEvent(order.id, "FRAUD_CHECK", `Fraud Check: ${riskAnalysis.ratingLabel} (${fraud_status.toUpperCase()}, Score: ${fraud_score}) - ${riskAnalysis.recommendation}`, fraudData);

  return { fraud_status, fraud_score, data: fraudData, analysis: riskAnalysis };
}
