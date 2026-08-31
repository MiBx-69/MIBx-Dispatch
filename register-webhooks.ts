import { config } from "dotenv";
config({ path: ".env" });
import { registerShopifyWebhook, getShopifyWebhooks } from "./src/lib/shopify/client";

async function run() {
  const REQUIRED_TOPICS = [
    "ORDERS_CREATE",
    "ORDERS_UPDATED",
    "ORDERS_CANCELLED",
    "ORDERS_FULFILLED",
  ];
  
  const existingWebhooks = await getShopifyWebhooks();
  const existingTopics = existingWebhooks.map((w: any) => w.topic);
  
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mibxdispatch.vercel.app";
  const callbackUrl = `${appUrl.replace(/\/$/, "")}/api/webhooks/shopify`;
  
  console.log("Registering webhooks to", callbackUrl);
  
  for (const topic of REQUIRED_TOPICS) {
    if (existingTopics.includes(topic)) {
      console.log(`- ${topic} already registered`);
      continue;
    }
    
    try {
      await registerShopifyWebhook(topic, callbackUrl);
      console.log(`+ ${topic} registered successfully`);
    } catch (err: any) {
      console.error(`x Failed to register ${topic}:`, err.message);
    }
  }
}
run();
