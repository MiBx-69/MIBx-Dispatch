import { createServiceClient } from "@/lib/supabase/server";
import { ShieldCheck, ShieldAlert, Zap } from "lucide-react";
import { updateFraudSettings } from "./actions";
import { SteadfastConnectForm } from "./steadfast-form";

export const metadata = { title: "Fraud & Risk Settings" };

export default async function FraudSettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  const isFraudSpyActive = Boolean(settings?.fraud_check_enabled && settings?.fraudspy_api_key);
  const isFraudSpyKeySet = Boolean(settings?.fraudspy_api_key);

  const isMrFraudActive = Boolean(settings?.mr_fraud_checker_enabled && settings?.mr_fraud_checker_api_key);
  const isMrFraudKeySet = Boolean(settings?.mr_fraud_checker_api_key);

  const hasAnyActive = isFraudSpyActive || isMrFraudActive;

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Fraud & Risk Setup</h2>
        <p className="text-sm text-zinc-500">
          Configure fraud detection providers. Enable either or both to automatically flag risky orders.
          When both are active, scores are combined (60% FraudSpy + 40% Mr. Fraud Checker) and the
          higher-risk result always wins.
        </p>
      </div>

      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-6">
        <form action={updateFraudSettings} className="space-y-6">

          {/* ── FraudSpy Provider ── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-400"></div>
              <h3 className="text-sm font-semibold text-zinc-200">FraudSpy</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                isFraudSpyActive
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : isFraudSpyKeySet
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
              }`}>
                {isFraudSpyActive ? "Active" : isFraudSpyKeySet ? "Key Set — Disabled" : "Not Configured"}
              </span>
            </div>
            <p className="text-xs text-zinc-500 -mt-2">
              Checks BD phone numbers against courier networks + merchant fraud reports (fraudspy.com.bd).
            </p>

            {/* FraudSpy Toggle */}
            <div className="flex items-center justify-between p-3 bg-zinc-950 rounded-lg border border-zinc-800/50">
              <div className="space-y-0.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-2">
                  Enable FraudSpy
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                </label>
                <p className="text-[11px] text-zinc-500">Run FraudSpy risk checks on incoming orders</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  name="fraud_check_enabled"
                  value="true"
                  defaultChecked={settings?.fraud_check_enabled || false}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>

            {/* FraudSpy API Key */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-400">FraudSpy API Key</label>
              <input
                type="password"
                name="fraudspy_api_key"
                defaultValue={settings?.fraudspy_api_key || ""}
                placeholder="fs_live_xxxxxxxxxxxxxxxx"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
              />
              <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                <ShieldAlert className="w-3 h-3" />
                Both the toggle and key must be set for this provider to run.
              </p>
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="border-t border-zinc-800"></div>

          {/* ── Mr. Fraud Checker Provider ── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400"></div>
              <h3 className="text-sm font-semibold text-zinc-200">Mr. Fraud Checker</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                isMrFraudActive
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : isMrFraudKeySet
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
              }`}>
                {isMrFraudActive ? "Active" : isMrFraudKeySet ? "Key Set — Disabled" : "Not Configured"}
              </span>
            </div>
            <p className="text-xs text-zinc-500 -mt-2">
              Checks Steadfast, Pathao, REDX &amp; CarryBee history (
              <code className="text-zinc-400 text-[10px]">fraudchecker.ocs-api.top</code>). 
              Complements FraudSpy with additional courier networks.
            </p>

            {/* Mr. Fraud Checker Toggle */}
            <div className="flex items-center justify-between p-3 bg-zinc-950 rounded-lg border border-zinc-800/50">
              <div className="space-y-0.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-2">
                  Enable Mr. Fraud Checker
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                </label>
                <p className="text-[11px] text-zinc-500">Run Mr. Fraud Checker risk checks on incoming orders</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  name="mr_fraud_checker_enabled"
                  value="true"
                  defaultChecked={settings?.mr_fraud_checker_enabled || false}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {/* Mr. Fraud Checker API Key */}
            <div className="space-y-2">
              <label className="block text-xs font-medium text-zinc-400">Mr. Fraud Checker API Key</label>
              <input
                type="password"
                name="mr_fraud_checker_api_key"
                defaultValue={settings?.mr_fraud_checker_api_key || ""}
                placeholder="Your API key from fraudchecker.ocs-api.top"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-amber-500/50 transition-colors"
              />
              <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                <ShieldAlert className="w-3 h-3" />
                Both the toggle and key must be set for this provider to run.
              </p>
            </div>
          </div>

          {/* ── Active Providers / Status Summary ── */}
          <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800/50 flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-400 font-medium">Status:</span>
            {isFraudSpyActive && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-medium">
                FraudSpy
              </span>
            )}
            {isMrFraudActive && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                Mr. Fraud Checker
              </span>
            )}
            {isFraudSpyActive && isMrFraudActive && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Combined mode (60% + 40%)
              </span>
            )}
            {isFraudSpyActive && !isMrFraudActive && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
                Single Provider (FraudSpy only)
              </span>
            )}
            {!isFraudSpyActive && isMrFraudActive && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium">
                Single Provider (Mr. Fraud Checker only)
              </span>
            )}
            {!hasAnyActive && (
              <span className="text-xs text-zinc-500 flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-zinc-500" />
                All fraud checking is disabled. Turn on a provider toggle above to activate scoring.
              </span>
            )}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>

      <SteadfastConnectForm />
    </div>
  );
}
