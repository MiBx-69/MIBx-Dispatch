"use client";

import { useState } from "react";

export function WebhookManager({ initialWebhooks = [] }: { initialWebhooks?: any[] }) {
  const [webhooks, setWebhooks] = useState(initialWebhooks);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const registerWebhooks = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/webhooks/register", { method: "POST" });
      const data = await res.json();
      
      if (res.ok) {
        setMessage({ type: "success", text: "Webhooks registered successfully!" });
        // Let's just reload the page to get the fresh list from Server
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
        <div className={`p-4 rounded-xl text-sm ${message.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'}`}>
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
