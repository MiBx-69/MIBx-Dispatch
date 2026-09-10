import { createServiceClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { updateShippingSettings } from "./actions";
import { Truck } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Shipping & Returns Settings" };

export default async function ShippingSettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <div>
        <Link href="/settings" className="text-indigo-400 hover:text-indigo-300 text-sm font-medium mb-2 inline-block">
          &larr; Back to Settings
        </Link>
        <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
          <Truck className="w-5 h-5 text-zinc-400" />
          Shipping & Returns
        </h2>
        <p className="text-sm text-zinc-500 mt-1">Configure your default delivery charges for returns based on location.</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden p-6 space-y-6">
        <ActionForm action={updateShippingSettings} successMessage="Shipping Settings updated successfully" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Delivery Charge (Inside Dhaka)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">BDT</span>
                <input
                  type="number"
                  name="delivery_charge_inside_dhaka"
                  defaultValue={settings?.delivery_charge_inside_dhaka ?? 60}
                  placeholder="60"
                  min="0"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <p className="text-[10px] text-zinc-500">Auto-populated fee for returns from inside Dhaka.</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Delivery Charge (Outside Dhaka)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">BDT</span>
                <input
                  type="number"
                  name="delivery_charge_outside_dhaka"
                  defaultValue={settings?.delivery_charge_outside_dhaka ?? 120}
                  placeholder="120"
                  min="0"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <p className="text-[10px] text-zinc-500">Auto-populated fee for returns from outside Dhaka.</p>
            </div>
            <div className="space-y-2 col-span-1 md:col-span-2 pt-4 border-t border-zinc-800/50">
              <label className="text-xs font-medium text-zinc-400">Auto-Deliver Days</label>
              <div className="relative max-w-xs">
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">Days</span>
                <input
                  type="number"
                  name="auto_mark_delivered_days"
                  defaultValue={settings?.auto_mark_delivered_days ?? 7}
                  placeholder="7"
                  min="0"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-3 pr-12 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <p className="text-[10px] text-zinc-500">Number of days after dispatch before an order is automatically marked as delivered if no other status updates occur. Set to 0 to disable.</p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-zinc-800/50">
            <SubmitButton className="px-6 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium">
              Save Settings
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
