import { createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Store, Truck, Webhook, Shield, User } from "lucide-react";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  const sections = [
    {
      title: "Shopify Integration",
      description: "Manage shop domain, API access token, and sync preferences.",
      icon: Store,
      href: "/settings/shopify",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      isConfigured: !!settings?.shopify_shop_domain,
    },
    {
      title: "Pathao Courier",
      description: "Configure Merchant API credentials and store IDs.",
      icon: Truck,
      href: "/settings/pathao",
      color: "text-red-400",
      bg: "bg-red-500/10",
      isConfigured: !!settings?.pathao_client_id,
    },
    {
      title: "Webhooks",
      description: "View webhook endpoints and verification secrets.",
      icon: Webhook,
      href: "/settings/webhooks",
      color: "text-indigo-400",
      bg: "bg-indigo-500/10",
      isConfigured: !!settings?.shopify_webhook_secret,
    },
    {
      title: "Fraud & Risk",
      description: "Configure FraudSpy API and risk score thresholds.",
      icon: Shield,
      href: "/settings/fraud",
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      isConfigured: !!settings?.fraudspy_api_key,
    },
    {
      title: "Account & Team",
      description: "Manage users, passkeys, and roles.",
      icon: User,
      href: "/settings/account",
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      isConfigured: true,
    },
  ];

  return (
    <div className="space-y-4 animate-fade-in max-w-3xl">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Settings</h2>
        <p className="text-sm text-zinc-500">Configure your dispatch ERP</p>
      </div>

      {!settings?.shopify_shop_domain && (
        <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 mb-6">
          <h3 className="text-sm font-semibold text-indigo-400 mb-2">Connect Shopify Store</h3>
          <p className="text-xs text-zinc-400 mb-3">
            Enter your Shopify domain to install the app and automatically sync your API token.
          </p>
          <form action="/api/auth/shopify" method="GET" className="flex gap-2">
            <input 
              type="text" 
              name="shop" 
              placeholder="e.g. your-store.myshopify.com" 
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500"
              required
            />
            <button 
              type="submit"
              className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Install App
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sections.map((s) => (
          <Link key={s.title} href={s.href}>
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 
                           transition-all h-full flex flex-col">
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-xl ${s.bg} border border-zinc-700/50 shrink-0`}>
                  <s.icon size={20} className={s.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-200">{s.title}</h3>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                    {s.description}
                  </p>
                </div>
              </div>
              
              <div className="mt-auto pt-4 flex items-center justify-between">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                  s.isConfigured 
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    : "bg-orange-500/10 text-orange-400 border-orange-500/20"
                }`}>
                  {s.isConfigured ? "Configured" : "Not Configured"}
                </span>
                <span className="text-xs text-indigo-400 group-hover:text-indigo-300">
                  Manage →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
