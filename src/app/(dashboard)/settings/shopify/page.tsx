import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Shopify Settings" };

export default async function ShopifySettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Shopify Integration Settings</h2>
        <p className="text-sm text-zinc-500">View and manage your Shopify connection.</p>
      </div>

      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-400">Shop Domain</label>
          <div className="p-3 bg-zinc-950 rounded-lg text-zinc-200 border border-zinc-800">
            {settings?.shopify_shop_domain || "Not configured"}
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-400">Access Token</label>
          <div className="p-3 bg-zinc-950 rounded-lg text-zinc-200 border border-zinc-800 font-mono text-xs break-all">
            {settings?.shopify_access_token ? "••••••••••••••••••••••••" : "Not configured"}
          </div>
          <p className="text-xs text-emerald-500">Automatically managed via OAuth.</p>
        </div>
      </div>
    </div>
  );
}
