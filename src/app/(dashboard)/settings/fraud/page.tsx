import { createServiceClient } from "@/lib/supabase/server";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { updateFraudSettings } from "./actions";

export const metadata = { title: "Fraud & Risk Settings" };

export default async function FraudSettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Fraud & Risk Setup</h2>
        <p className="text-sm text-zinc-500">Configure FraudSpy API integration to automatically flag risky orders.</p>
      </div>

      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl space-y-6">
        <form action={updateFraudSettings} className="space-y-5">
          {/* Enable Fraud Check */}
          <div className="flex items-center justify-between p-4 bg-zinc-950 rounded-lg border border-zinc-800/50">
            <div className="space-y-1">
              <label className="text-sm font-medium text-zinc-200 flex items-center gap-2">
                Enable Automated Risk Scoring
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </label>
              <p className="text-xs text-zinc-500">
                Automatically analyze every new Shopify order for risk factors.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                name="fraud_check_enabled"
                value="true"
                defaultChecked={settings?.fraud_check_enabled || false}
                className="sr-only peer" 
              />
              <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
            </label>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-zinc-300">
              FraudSpy API Key
            </label>
            <input
              type="password"
              name="fraudspy_api_key"
              defaultValue={settings?.fraudspy_api_key || ""}
              placeholder="fs_live_xxxxxxxxxxxxxxxx"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
            <p className="text-xs text-zinc-500 flex items-center gap-1.5 mt-1">
              <ShieldAlert className="w-3 h-3" />
              Optional: If left blank, our internal risk heuristic will be used instead.
            </p>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
