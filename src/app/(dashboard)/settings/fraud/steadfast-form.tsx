"use client";

import { useState } from "react";
import { connectSteadfastAction } from "./actions";
import { toast } from "sonner";

export function SteadfastConnectForm() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const res = await connectSteadfastAction(formData);
    
    if (res.success) {
      toast.success(res.message);
      (e.target as HTMLFormElement).reset();
    } else {
      toast.error(res.error || "Failed to connect");
    }
    
    setLoading(false);
  };

  return (
    <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-4 mt-6">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Connect Steadfast to FraudSpy</h3>
        <p className="text-xs text-zinc-500 mt-1">Connect your Steadfast Courier account to FraudSpy to automate reporting directly via API.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-xs font-medium text-zinc-300">
            Steadfast API Key
          </label>
          <input
            type="password"
            name="steadfast_api_key"
            required
            placeholder="Your Steadfast API Key"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>
        
        <div className="space-y-2">
          <label className="block text-xs font-medium text-zinc-300">
            Steadfast Secret Key
          </label>
          <input
            type="password"
            name="steadfast_secret_key"
            required
            placeholder="Your Steadfast Secret Key"
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Connect Steadfast
          </button>
        </div>
      </form>
    </div>
  );
}
