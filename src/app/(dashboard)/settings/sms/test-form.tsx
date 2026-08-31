"use client";

import { useState } from "react";
import { sendTestSMS } from "./actions";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";

export function TestSMSForm() {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const res = await sendTestSMS(formData);
    
    if (res.success) {
      toast.success(res.message);
      (e.target as HTMLFormElement).reset();
    } else {
      toast.error(res.error || "Failed to send test SMS");
    }
    
    setLoading(false);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden p-6 mt-6">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-indigo-400" />
          Test SMS Functionality
        </h3>
        <p className="text-xs text-zinc-500 mt-1">Send a test message to your own number to verify your API credentials.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          name="test_phone"
          required
          placeholder="017XXXXXXXX"
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center min-w-[120px]"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full animate-spin" />
          ) : (
            "Send Test SMS"
          )}
        </button>
      </form>
    </div>
  );
}
