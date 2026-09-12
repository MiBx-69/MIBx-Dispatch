import { createServiceClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft, Clock, ExternalLink, RefreshCw, Shield, Zap } from "lucide-react";
import { CopyCronUrl } from "./copy-cron-url";

export const metadata = { title: "Sync Scheduler — Settings" };

export default async function SyncSettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") || headersList.get("host") || "your-app.vercel.app";
  const proto = headersList.get("x-forwarded-proto") || "https";
  const cronUrl = `${proto}://${host}/api/cron/courier-sync`;

  const hasQstash =
    !!process.env.QSTASH_CURRENT_SIGNING_KEY && !!process.env.QSTASH_NEXT_SIGNING_KEY;
  const hasSecret = !!(process.env.CRON_SECRET || settings?.cron_secret);

  // Fetch last 5 cron executions from webhook_logs
  const { data: logs } = await supabase
    .from("webhook_logs")
    .select("created_at, processed, error, payload")
    .eq("event_type", "cron/courier_sync")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/settings"
          className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors"
        >
          <ArrowLeft size={16} className="text-zinc-400" />
        </Link>
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Sync Scheduler</h2>
          <p className="text-sm text-zinc-500">Automated Pathao courier status sync (Vercel Cron alternative)</p>
        </div>
      </div>

      {/* Status banner */}
      <div className={`p-4 rounded-xl border ${hasQstash ? "bg-emerald-500/10 border-emerald-500/20" : hasSecret ? "bg-amber-500/10 border-amber-500/20" : "bg-zinc-800 border-zinc-700"}`}>
        <div className="flex items-center gap-2 mb-1">
          {hasQstash ? (
            <><Zap size={15} className="text-emerald-400" /><span className="text-sm font-semibold text-emerald-400">QStash Active</span></>
          ) : hasSecret ? (
            <><Shield size={15} className="text-amber-400" /><span className="text-sm font-semibold text-amber-400">Secret-based Auth</span></>
          ) : (
            <><Clock size={15} className="text-zinc-400" /><span className="text-sm font-semibold text-zinc-300">Not Configured</span></>
          )}
        </div>
        <p className="text-xs text-zinc-400">
          {hasQstash
            ? "Your sync endpoint is secured with Upstash QStash signature verification."
            : hasSecret
            ? "Your endpoint accepts requests with the CRON_SECRET. Consider upgrading to QStash for reliability."
            : "Set up QStash or a CRON_SECRET to enable automated syncing."}
        </p>
      </div>

      {/* Endpoint URL */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">Cron Endpoint URL</h3>
          <span className="text-[10px] font-medium text-zinc-500 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full">
            POST
          </span>
        </div>
        <CopyCronUrl url={cronUrl} />
        <p className="text-xs text-zinc-500">
          Use this URL when configuring your external scheduler. The endpoint syncs Pathao courier
          statuses and marks delivered/returned orders automatically.
        </p>
      </div>

      {/* QStash Setup Instructions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <Zap size={15} className="text-indigo-400" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-200">Setup with Upstash QStash (Recommended)</h3>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          QStash is a free serverless scheduler by Upstash. It works on Vercel free tier with no cold-start
          issues and supports reliable HTTP scheduling.
        </p>

        <ol className="space-y-3">
          {[
            {
              n: 1,
              title: "Create a free Upstash account",
              desc: "Go to console.upstash.com → QStash → Get started (100 messages/day free).",
              link: "https://console.upstash.com/qstash",
              linkText: "Open Upstash Console →",
            },
            {
              n: 2,
              title: "Create a scheduled endpoint",
              desc: `Click "Create Schedule" → Method: POST → URL: paste the endpoint URL above → Cron: 0 * * * * (every hour)`,
            },
            {
              n: 3,
              title: "Copy your signing keys",
              desc: "In the QStash dashboard, go to API Keys → copy QSTASH_CURRENT_SIGNING_KEY and QSTASH_NEXT_SIGNING_KEY.",
            },
            {
              n: 4,
              title: "Add env vars to Vercel",
              desc: "In your Vercel project → Settings → Environment Variables, add both keys. Re-deploy after saving.",
              code: "QSTASH_CURRENT_SIGNING_KEY=sig_...\nQSTASH_NEXT_SIGNING_KEY=sig_...",
            },
          ].map((step) => (
            <li key={step.n} className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-[11px] font-bold flex items-center justify-center mt-0.5">
                {step.n}
              </span>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-zinc-200">{step.title}</p>
                <p className="text-xs text-zinc-500 leading-relaxed">{step.desc}</p>
                {step.code && (
                  <pre className="text-[11px] bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-zinc-300 whitespace-pre-wrap break-all mt-1">
                    {step.code}
                  </pre>
                )}
                {step.link && (
                  <a
                    href={step.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                  >
                    {step.linkText} <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>

      {/* Recommended Schedule */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-semibold text-zinc-200">Recommended Cron Schedules</h3>
        <div className="space-y-2">
          {[
            { cron: "0 * * * *", label: "Every hour", recommended: true },
            { cron: "*/30 * * * *", label: "Every 30 minutes" },
            { cron: "0 */6 * * *", label: "Every 6 hours (low activity)" },
          ].map((s) => (
            <div key={s.cron} className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800 border border-zinc-700">
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-indigo-300">{s.cron}</code>
                <span className="text-xs text-zinc-400">{s.label}</span>
              </div>
              {s.recommended && (
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
                  Recommended
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Execution Logs */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <RefreshCw size={14} className="text-zinc-400" />
          <h3 className="text-sm font-semibold text-zinc-200">Recent Sync Executions</h3>
        </div>

        {(!logs || logs.length === 0) ? (
          <p className="text-xs text-zinc-500 py-2">No executions recorded yet. The sync logs here once triggered.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log: any, i: number) => {
              const payload = log.payload as any;
              return (
                <div
                  key={i}
                  className={`p-2.5 rounded-lg border text-xs ${log.error ? "bg-red-500/5 border-red-500/20" : "bg-zinc-800 border-zinc-700"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-medium ${log.error ? "text-red-400" : "text-emerald-400"}`}>
                      {log.error ? "⚠ Error" : "✓ Success"}
                    </span>
                    <span className="text-zinc-500">
                      {new Date(log.created_at).toLocaleString("en-BD", {
                        timeZone: "Asia/Dhaka",
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {payload && (
                    <p className="text-zinc-400">
                      Scanned {payload.total_scanned ?? 0} · Updated {payload.total_updated ?? 0} ·{" "}
                      {payload.duration_ms ?? 0}ms
                      {payload.errors_count > 0 && (
                        <span className="text-amber-400"> · {payload.errors_count} errors</span>
                      )}
                    </p>
                  )}
                  {log.error && <p className="text-red-400 mt-1">{log.error}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
