import { searchFraud } from "@/lib/fraudspy";
import { updateShopifyCustomer, updateShopifyOrder } from "@/lib/shopify/client";
import { analyzeCustomerRisk } from "@/lib/risk-analytics";

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

  // 5. Update Shopify Customer Profile (Tags)
  if (order.shopify_customer_id) {
    try {
      const { data: customerData } = await supabase.from("customers").select("shopify_tags").eq("shopify_id", order.shopify_customer_id).single();
      const existingTags = customerData?.shopify_tags || [];
      const mergedTags = Array.from(new Set([...existingTags, tag, 'FraudSpy Verified']));

      await updateShopifyCustomer({
        id: `gid://shopify/Customer/${order.shopify_customer_id}`,
        tags: mergedTags
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
        customAttributes: [
          { key: "FraudSpy Status", value: fraud_status.toUpperCase() },
          { key: "FraudSpy Score", value: fraud_score.toString() },
          { key: "FraudSpy Delivered", value: (fraudData.overall?.delivered || 0).toString() },
          { key: "FraudSpy Returned", value: (fraudData.overall?.returned || 0).toString() },
          { key: "FraudSpy Success Ratio", value: `${fraudData.overall?.success_ratio || 0}%` },
          { key: "FraudSpy Last Checked", value: new Date().toLocaleString() }
        ]
      });
    } catch (shopifyError) {
      console.error("Failed to update Shopify order:", shopifyError);
    }
  }

  const { logOrderEvent } = await import("@/lib/audit");
  await logOrderEvent(order.id, "FRAUD_CHECK", `Fraud Check: ${riskAnalysis.ratingLabel} (${fraud_status.toUpperCase()}, Score: ${fraud_score}) - ${riskAnalysis.recommendation}`, fraudData);

  return { fraud_status, fraud_score, data: fraudData, analysis: riskAnalysis };
}
