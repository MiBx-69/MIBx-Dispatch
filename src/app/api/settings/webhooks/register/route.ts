import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { registerShopifyWebhook, getShopifyWebhooks } from "@/lib/shopify/client";

const REQUIRED_TOPICS = [
  "ORDERS_CREATE",
  "ORDERS_UPDATED",
  "ORDERS_CANCELLED",
  "ORDERS_FULFILLED",
];

export async function POST(request: NextRequest) {
  try {
    // 1. Verify admin
    const { data: { user } } = await (await import("@/lib/supabase/server")).createClient().then(c => c.auth.getUser()).catch(() => ({ data: { user: null } }));
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch existing webhooks to avoid duplicates
    const existingWebhooks = await getShopifyWebhooks();
    const existingTopics = existingWebhooks.map((w: any) => w.topic);

    // 3. Determine base URL for webhook callback
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mibxdispatch.vercel.app";
    const callbackUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/shopify`;

    // 4. Register missing topics
    const results = [];
    for (const topic of REQUIRED_TOPICS) {
      if (existingTopics.includes(topic)) {
        results.push({ topic, status: "already_registered" });
        continue;
      }

      try {
        await registerShopifyWebhook(topic, callbackUrl);
        results.push({ topic, status: "registered" });
      } catch (err: any) {
        console.error(`Failed to register ${topic}:`, err);
        results.push({ topic, status: "failed", error: err.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error("Webhook Registration Error:", error);
    return NextResponse.json({ error: error.message || "Failed to register webhooks" }, { status: 500 });
  }
}
