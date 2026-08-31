import { createServiceClient } from "@/lib/supabase/server";
import { RefreshCw } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Shopify Settings" };

export default async function ShopifySettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  const shopDomain = settings?.shopify_shop_domain;

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Shopify Integration Settings</h2>
        <p className="text-sm text-zinc-500">View and manage your Shopify connection.</p>
      </div>

      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-400">Shop Domain</label>
            <div className="p-3 bg-zinc-950 rounded-lg text-zinc-200 border border-zinc-800 flex items-center justify-between">
              <span>{shopDomain || "Not configured"}</span>
              {shopDomain && (
                <Link
                  href={`/api/auth/shopify?shop=${shopDomain}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
                >
                  <RefreshCw size={14} /> Reconnect Store
                </Link>
              )}
            </div>
            {!shopDomain && (
              <form action="/api/auth/shopify" method="GET" className="mt-4 flex gap-2">
                <input 
                  type="text" 
                  name="shop" 
                  placeholder="e.g. mystore.myshopify.com" 
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
                  required
                />
                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
                  Connect
                </button>
              </form>
            )}
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
    </div>
  );
}
