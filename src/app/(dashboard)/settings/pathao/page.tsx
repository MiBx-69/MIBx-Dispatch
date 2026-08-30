import { createServiceClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { updatePathaoSettings } from "./actions";

export const metadata = { title: "Pathao Settings" };

export default async function PathaoSettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Pathao Courier Settings</h2>
        <p className="text-sm text-zinc-500">Configure your connection to the Pathao Merchant API.</p>
      </div>

      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
        <ActionForm action={updatePathaoSettings} successMessage="Pathao settings saved successfully" className="space-y-4">
          {(isPending) => (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Client ID</label>
                  <input type="text" name="client_id" defaultValue={settings?.pathao_client_id || ""} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-red-500/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Client Secret</label>
                  <input type="password" name="client_secret" defaultValue={settings?.pathao_client_secret || ""} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-red-500/50" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Username</label>
                  <input type="text" name="username" defaultValue={settings?.pathao_username || ""} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-red-500/50" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Password</label>
                  <input type="password" name="password" defaultValue={settings?.pathao_password || ""} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-red-500/50" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Default Store ID</label>
                <input type="number" name="store_id" defaultValue={settings?.pathao_store_id || ""} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-red-500/50" />
              </div>
              <div className="pt-4">
                <SubmitButton isPending={isPending} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium">
                  Save Pathao Credentials
                </SubmitButton>
              </div>
            </>
          )}
        </ActionForm>
      </div>
    </div>
  );
}
