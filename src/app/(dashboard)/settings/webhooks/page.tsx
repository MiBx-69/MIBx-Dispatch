import { getShopifyWebhooks } from "@/lib/shopify/client";
import { WebhookManager } from "./webhook-manager";

export const metadata = { title: "Webhooks Settings" };

export default async function WebhooksSettingsPage() {
  let webhooks = [];
  try {
    webhooks = await getShopifyWebhooks();
  } catch (err) {
    console.error("Failed to fetch webhooks on server:", err);
  }

  const { createServiceClient } = await import("@/lib/supabase/server");
  const supabaseAdmin = createServiceClient();
  const { data: settings } = await supabaseAdmin.from("app_settings").select("shopify_webhook_secret").single();

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Webhooks</h2>
        <p className="text-sm text-zinc-500">Manage incoming webhook events from Shopify and Pathao.</p>
      </div>

      <WebhookManager initialWebhooks={webhooks} initialSecret={settings?.shopify_webhook_secret || ""} />
    </div>
  );
}
