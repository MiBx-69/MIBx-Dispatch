"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function PasskeyButton({ redirectTo }: { redirectTo: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handlePasskeyLogin = async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();
    
    try {
      const { data, error } = await supabase.auth.signInWithPasskey();
      
      if (error) {
        setError(error.message);
      } else if (data?.user) {
        router.push(redirectTo);
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      <button
        onClick={handlePasskeyLogin}
        disabled={loading}
        type="button"
        className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium
                  rounded-lg transition-colors border border-zinc-700 text-sm flex items-center
                  justify-center gap-2.5 touch-target disabled:opacity-50"
      >
        {loading ? (
          <span className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        )}
        {loading ? "Signing in..." : "Sign in with Passkey"}
      </button>
    </div>
  );
}
