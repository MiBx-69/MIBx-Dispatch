import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect(params.redirectTo || "/");
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-zinc-950 relative overflow-hidden px-4">
      {/* Background gradient */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 mb-4">
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">MiBx Dispatch</h1>
          <p className="text-zinc-400 text-sm mt-1">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="glass rounded-2xl p-6">
          {params.error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {params.error === "unauthorized"
                ? "Access denied. Contact your administrator."
                : "Invalid credentials. Please try again."}
            </div>
          )}

          <form action="/api/auth/login" method="POST" className="space-y-4">
            <input type="hidden" name="redirectTo" value={params.redirectTo || "/"} />

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100
                          placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1
                          focus:ring-indigo-500 transition-colors text-sm"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-700 text-zinc-100
                          placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1
                          focus:ring-indigo-500 transition-colors text-sm"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium
                        rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500
                        focus:ring-offset-2 focus:ring-offset-zinc-900 text-sm touch-target"
            >
              Sign In
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-transparent text-zinc-600">or continue with</span>
            </div>
          </div>

          {/* Passkey button */}
          <form action="/api/auth/passkey" method="POST">
            <input type="hidden" name="redirectTo" value={params.redirectTo || "/"} />
            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium
                        rounded-lg transition-colors border border-zinc-700 text-sm flex items-center
                        justify-center gap-2.5 touch-target"
            >
              <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              Sign in with Passkey
            </button>
          </form>

          <p className="mt-4 text-xs text-zinc-600 text-center">
            No account? Contact your admin to get access.
          </p>
        </div>

        <p className="text-center text-xs text-zinc-700 mt-6">
          © {new Date().getFullYear()} MiBx Dispatch. Internal use only.
        </p>
      </div>
    </div>
  );
}
