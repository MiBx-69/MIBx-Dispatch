import { createServiceClient } from "@/lib/supabase/server";
import { CheckCircle2, AlertTriangle, ExternalLink, RefreshCw, KeyRound, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { updateShopifyCredentials } from "./actions";

export const metadata = { title: "Shopify Settings" };

export default async function ShopifySettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  const shopDomain = settings?.shopify_shop_domain || process.env.SHOPIFY_SHOP_DOMAIN || "";
  const accessToken = settings?.shopify_access_token || process.env.SHOPIFY_ACCESS_TOKEN || "";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://orders.universesraw.com";
  const callbackUrl = `${appUrl.replace(/\/$/, "")}/api/auth/shopify/callback`;

  // Test live connection to Shopify
  let isConnected = false;
  let verifiedStoreName = "";
  let connectionError = "";

  if (shopDomain && accessToken) {
    try {
      const apiVersion = process.env.SHOPIFY_API_VERSION || "2024-07";
      const res = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query: "{ shop { name myshopifyDomain } }" }),
        cache: "no-store",
      });
      const data = await res.json();
      if (data.data?.shop) {
        isConnected = true;
        verifiedStoreName = data.data.shop.name;
      } else if (data.errors?.length) {
        connectionError = data.errors[0]?.message || "Invalid credentials";
      }
    } catch (err: any) {
      connectionError = err.message || "Network error connecting to Shopify";
    }
  }

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in pb-12">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Shopify Integration Settings</h2>
        <p className="text-sm text-zinc-500">Configure your Shopify Admin API connection and OAuth credentials.</p>
      </div>

      {/* Live Status Banner */}
      {isConnected ? (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-emerald-300">
              Connected to {verifiedStoreName || "Shopify Store"} ({shopDomain})
            </h3>
            <p className="text-xs text-emerald-400/80">
              Admin GraphQL API is actively connected and orders are syncing normally.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-amber-300">Shopify Not Connected</h3>
            <p className="text-xs text-amber-400/80">
              {connectionError || "Please enter your Shopify Shop Domain and Admin API Access Token below to connect."}
            </p>
          </div>
        </div>
      )}

      {/* Direct API Token Configuration (Instant & Reliable) */}
      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-indigo-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Direct Admin API Credentials</h3>
        </div>
        <p className="text-xs text-zinc-400">
          Enter your Shopify Custom App credentials directly. This works instantly without requiring OAuth redirect configuration.
        </p>

        <ActionForm action={updateShopifyCredentials} successMessage="Shopify credentials verified and saved" className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">Shop Domain</label>
            <input
              type="text"
              name="shop_domain"
              defaultValue={shopDomain}
              placeholder="e.g. f1axic-dv.myshopify.com"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-300">Admin API Access Token</label>
            <input
              type="password"
              name="access_token"
              defaultValue={accessToken}
              placeholder="shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 font-mono text-sm focus:outline-none focus:border-indigo-500/50"
              required
            />
            <p className="text-[11px] text-zinc-500">
              Found in Shopify Admin &gt; Settings &gt; Apps and sales channels &gt; Develop apps &gt; Your Custom App &gt; API credentials.
            </p>
          </div>

          <div className="pt-2">
            <SubmitButton className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors">
              Verify &amp; Save Credentials
            </SubmitButton>
          </div>
        </ActionForm>
      </div>

      {/* OAuth Whitelist & Reconnect */}
      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Shopify OAuth Whitelist Configuration</h3>
        </div>
        
        <p className="text-xs text-zinc-400 leading-relaxed">
          If you see <span className="text-amber-300 font-mono text-[11px]">&quot;The redirect_uri is not whitelisted&quot;</span> in Shopify, your Shopify Partner app configuration must be updated with the exact callback URL below.
        </p>

        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-1.5">
          <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Required Allowed Redirection URL</span>
          <div className="font-mono text-xs text-indigo-300 select-all bg-zinc-900/80 p-2 rounded border border-zinc-800 break-all">
            {callbackUrl}
          </div>
          <p className="text-[11px] text-zinc-500">
            Paste this URL into: <strong>Shopify Partners Dashboard &gt; Apps &gt; [Your App] &gt; Configuration / App Setup &gt; Allowed redirection URL(s)</strong>
          </p>
        </div>

        {shopDomain && (
          <div className="pt-2 flex items-center gap-3">
            <Link
              href={`/api/auth/shopify?shop=${shopDomain}`}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors"
            >
              <RefreshCw size={14} /> Reconnect via OAuth
            </Link>
            <a
              href={`https://partners.shopify.com/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <span>Open Shopify Partners</span>
              <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
