import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { searchFraud } from "@/lib/fraudspy";
import { updateShopifyCustomer, updateShopifyOrder } from "@/lib/shopify/client";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();
    
    // 1. Get settings and order
    const [{ data: settings }, { data: order }] = await Promise.all([
      supabase.from("app_settings").select("fraudspy_api_key").single(),
      supabase.from("orders").select("*").eq("id", id).single()
    ]);

    if (!settings?.fraudspy_api_key) {
      return NextResponse.json({ error: "FraudSpy API key not configured" }, { status: 400 });
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    if (!order.customer_phone) {
      return NextResponse.json({ error: "Order has no customer phone number" }, { status: 400 });
    }

    // 2. Query FraudSpy
    const fraudData = await searchFraud(order.customer_phone, settings.fraudspy_api_key);
    if (!fraudData || !fraudData.ok) {
      return NextResponse.json({ error: "Failed to fetch data from FraudSpy" }, { status: 500 });
    }

    // 3. Determine status and score
    let fraud_status = "safe";
    let fraud_score = 0;

    if (fraudData.fraud_reports) {
      fraud_score = fraudData.fraud_reports.risk.score;
      if (fraudData.fraud_reports.risk.level === "HIGH") {
        fraud_status = "fraud";
      } else if (fraudData.fraud_reports.risk.level === "MEDIUM") {
        fraud_status = "risky";
      }
    } else if (fraudData.overall) {
      const successRatio = fraudData.overall.success_ratio;
      const returned = fraudData.overall.returned;
      if (returned > 2 && successRatio < 50) {
        fraud_status = "fraud";
      } else if (returned > 0 && successRatio < 80) {
        fraud_status = "risky";
      }
    }

    // 4. Update Supabase Order
    await supabase
      .from("orders")
      .update({
        fraud_status,
        fraud_score,
        fraud_data: fraudData
      })
      .eq("id", id);

    const noteAppend = `[FraudSpy Report]\nStatus: ${fraud_status.toUpperCase()}\nScore: ${fraud_score}\nDelivered: ${fraudData.overall?.delivered || 0}\nReturned: ${fraudData.overall?.returned || 0}\nSuccess Ratio: ${fraudData.overall?.success_ratio || 0}%\nLast Checked: ${new Date().toISOString()}`;
    const tag = `FraudSpy: ${fraud_status === 'fraud' ? 'High Risk' : fraud_status === 'risky' ? 'Medium Risk' : 'Safe'}`;

    // 5. Update Shopify Customer Profile (Note & Tags)
    if (order.shopify_customer_id) {
      try {
        // First fetch existing customer tags to merge them
        const { data: customerData } = await supabase.from("customers").select("shopify_tags").eq("shopify_id", order.shopify_customer_id).single();
        const existingTags = customerData?.shopify_tags || [];
        const mergedTags = Array.from(new Set([...existingTags, tag, 'FraudSpy Verified']));

        await updateShopifyCustomer({
          id: `gid://shopify/Customer/${order.shopify_customer_id}`,
          note: noteAppend,
          tags: mergedTags
        });
      } catch (shopifyError) {
        console.error("Failed to update Shopify customer profile:", shopifyError);
      }
    }

    // 6. Update Shopify Order Profile (Note & Tags)
    if (order.shopify_order_id) {
      try {
        const finalOrderNote = order.note ? `${order.note}\n\n${noteAppend}` : noteAppend;
        await updateShopifyOrder({
          id: `gid://shopify/Order/${order.shopify_order_id}`,
          note: finalOrderNote,
          tags: [tag, 'FraudSpy Verified']
        });
      } catch (shopifyError) {
        console.error("Failed to update Shopify order:", shopifyError);
      }
    }

    return NextResponse.json({ 
      success: true, 
      fraud_status,
      fraud_score,
      data: fraudData 
    });

  } catch (error: any) {
    console.error("Manual fraud check error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
