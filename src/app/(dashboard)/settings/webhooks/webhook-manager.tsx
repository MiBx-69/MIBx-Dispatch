"use client";

import { useState, useEffect } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { updateWebhookSecret, updatePathaoWebhookSecret } from "./actions";
import { Copy, Check, RefreshCw, ExternalLink, ShieldCheck, Info } from "lucide-react";
import { toast } from "sonner";

export function WebhookManager({
  initialWebhooks = [],
  initialSecret = "",
  initialPathaoSecret = "",
}: {
  initialWebhooks?: any[];
  initialSecret?: string;
  initialPathaoSecret?: string;
}) {
  const [webhooks] = useState(initialWebhooks);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [origin, setOrigin] = useState("https://orders.universesraw.com");

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.origin) {
      setOrigin(window.location.origin);
    }
  }, []);

  const pathaoCallbackUrl = `${origin}/api/webhooks/pathao`;

  const copyToClipboard = async (text: string, type: "url" | "secret") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "url") {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedSecret(true);
        setTimeout(() => setCopiedSecret(false), 2000);
      }
      toast.success(type === "url" ? "Callback URL copied!" : "Integration secret copied!");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const [syncType, setSyncType] = useState<"7d" | "all" | null>(null);

  const syncActiveDispatches = async (days: number | "all" = 7) => {
    setIsSyncing(true);
    setSyncType(days === "all" ? "all" : "7d");
    const toastId = toast.loading(
      days === "all"
        ? "Running Full History Scan of all Pathao dispatches..."
        : "Scanning courier orders for the last 7 days..."
    );
    try {
      const res = await fetch(`/api/pathao/sync-status?days=${days}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      toast.success(
        `Courier Sync Complete! Checked ${data.checked || data.totalChecked} parcels, updated ${data.updated || data.updatedCount} orders.`,
        { id: toastId, duration: 5000 }
      );
    } catch (err: any) {
      toast.error(err.message || "Failed to sync with Pathao", { id: toastId });
    } finally {
      setIsSyncing(false);
      setSyncType(null);
    }
  };

  const registerWebhooks = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/webhooks/register", { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: "Webhooks registered successfully!" });
        window.location.reload();
      } else {
        setMessage({ type: "error", text: data.error || "Failed to register" });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Pathao Courier Section */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                <ShieldCheck size={14} />
              </span>
              <h3 className="text-zinc-200 font-semibold text-sm">Pathao Courier Webhook Integration</h3>
            </div>
            <p className="text-zinc-400 text-xs mt-1">
              Provides real-time parcel delivery, out-for-delivery, and return status updates directly from Pathao.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => syncActiveDispatches(7)}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-300 bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/25 transition-colors disabled:opacity-50"
              title="Scan Pathao status for dispatches in the last 7 days"
            >
              <RefreshCw size={12} className={isSyncing && syncType === "7d" ? "animate-spin text-amber-400" : "text-amber-400"} />
              <span>{isSyncing && syncType === "7d" ? "Scanning 7d..." : "Scan Last 7 Days"}</span>
            </button>
            <button
              onClick={() => syncActiveDispatches("all")}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-300 bg-red-600/15 hover:bg-red-600/25 border border-red-500/25 transition-colors disabled:opacity-50"
              title="Scan all dispatches on Pathao across full history"
            >
              <RefreshCw size={12} className={isSyncing && syncType === "all" ? "animate-spin text-red-400" : "text-red-400"} />
              <span>{isSyncing && syncType === "all" ? "Scanning All..." : "Full Scan (All Dispatches)"}</span>
            </button>
          </div>
        </div>

        {/* Live Webhook URL */}
        <div className="bg-zinc-950/70 border border-zinc-800 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span className="font-medium text-zinc-300">Pathao Callback URL (Set in Pathao Developer Portal):</span>
            <button
              onClick={() => copyToClipboard(pathaoCallbackUrl, "url")}
              className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              {copiedUrl ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedUrl ? "Copied" : "Copy URL"}</span>
            </button>
          </div>
          <div className="font-mono text-xs text-emerald-400 bg-zinc-900/90 border border-emerald-500/20 rounded px-2.5 py-1.5 break-all select-all flex items-center justify-between">
            <span>{pathaoCallbackUrl}</span>
          </div>
        </div>

        {/* Secret Configuration Form */}
        <ActionForm action={updatePathaoWebhookSecret} successMessage="Pathao webhook secret saved" className="flex gap-4 items-end max-w-xl">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-400">Pathao Integration Secret</label>
              {initialPathaoSecret && (
                <button
                  type="button"
                  onClick={() => copyToClipboard(initialPathaoSecret, "secret")}
                  className="text-[10px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                >
                  {copiedSecret ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
                  <span>{copiedSecret ? "Copied" : "Copy"}</span>
                </button>
              )}
            </div>
            <input
              type="text"
              name="pathao_webhook_secret"
              defaultValue={initialPathaoSecret}
              placeholder="e.g. f3992ecc-59da-..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-xs font-mono focus:outline-none focus:border-red-500/50"
            />
          </div>
          <div>
            <SubmitButton className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-medium">
              Save Secret
            </SubmitButton>
          </div>
        </ActionForm>

        {/* Pathao Setup Helper Note */}
        <div className="bg-zinc-950/50 border border-zinc-800/80 rounded-lg p-3 text-xs space-y-1.5 text-zinc-400">
          <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
            <Info size={13} className="text-indigo-400" />
            <span>Required Pathao Event Subscriptions</span>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            In your <a href="https://merchant.pathao.com/developers" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-0.5">Pathao Merchant Dashboard <ExternalLink size={10} /></a> under Webhooks, make sure to check all of these events:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 pt-1 font-mono text-[10px] text-zinc-300">
            <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">order.created</span>
            <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">order.picked</span>
            <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">order.in-transit</span>
            <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">order.assigned-for-delivery</span>
            <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">order.delivered</span>
            <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">order.partial-delivery</span>
            <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">order.returned</span>
            <span className="bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded">order.on-hold</span>
          </div>
          <p className="text-[10px] text-zinc-500 pt-1">
            * Note: When Pathao couriers update statuses in bulk or offline, our automated sync engine will automatically catch and reconcile any parcels that missed webhooks.
          </p>
        </div>
      </div>

      {/* Shopify Section */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-xl space-y-4">
        <div>
          <h3 className="text-zinc-200 font-medium text-sm">Shopify Webhook Secret</h3>
          <p className="text-zinc-500 text-xs mt-1">
            Required to verify incoming Shopify webhooks. Find this in your Shopify Admin -&gt; Settings -&gt; Notifications -&gt; Webhooks.
          </p>
        </div>

        <ActionForm action={updateWebhookSecret} successMessage="Webhook secret saved" className="flex gap-4 items-end max-w-xl">
          <div className="flex-1 space-y-2">
            <label className="text-xs font-medium text-zinc-400">Secret Key</label>
            <input
              type="password"
              name="shopify_webhook_secret"
              defaultValue={initialSecret}
              placeholder="e.g. whsec_..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
            />
          </div>
          <div>
            <SubmitButton className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium">
              Save Secret
            </SubmitButton>
          </div>
        </ActionForm>
      </div>

      <div className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
        <div>
          <h3 className="text-zinc-200 font-medium text-sm">Shopify Webhooks</h3>
          <p className="text-zinc-500 text-xs mt-1">
            Listen for instant order updates directly from your store.
          </p>
        </div>
        <button
          onClick={registerWebhooks}
          disabled={isLoading}
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
        >
          {isLoading ? "Registering..." : "Register Required Webhooks"}
        </button>
      </div>

      {message && (
        <div
          className={`p-4 rounded-xl text-sm ${
            message.type === "success"
              ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-zinc-400">
          <thead className="bg-zinc-950 text-xs text-zinc-500 uppercase border-b border-zinc-800">
            <tr>
              <th className="px-4 py-3 font-medium">Topic</th>
              <th className="px-4 py-3 font-medium">Callback URL</th>
              <th className="px-4 py-3 font-medium">Created At</th>
            </tr>
          </thead>
          <tbody>
            {webhooks.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                  No webhooks registered yet.
                </td>
              </tr>
            ) : (
              webhooks.map((w: any) => (
                <tr key={w.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                  <td className="px-4 py-3 font-mono text-xs text-emerald-400">{w.topic}</td>
                  <td className="px-4 py-3 font-mono text-xs truncate max-w-[200px]">{w.callbackUrl}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{new Date(w.createdAt).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
