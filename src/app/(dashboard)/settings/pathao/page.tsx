import { createServiceClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { updatePathaoSettings } from "./actions";
import { getPathaoStores } from "@/lib/pathao/client";

export const metadata = { title: "Pathao Settings" };

export default async function PathaoSettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  let stores: any[] = [];
  try {
    const data = await getPathaoStores();
    stores = data.data?.data || [];
  } catch (err) {
    // Stores may fail to load if credentials aren't saved yet
  }

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Pathao Courier Settings</h2>
        <p className="text-sm text-zinc-500">Configure your connection to the Pathao Merchant API.</p>
      </div>

      <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
        <ActionForm action={updatePathaoSettings} successMessage="Pathao settings saved successfully" className="space-y-4">
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
            <label className="text-sm font-medium text-zinc-300">Default Pickup Store</label>
            {stores.length > 0 ? (
              <select
                name="store_id"
                defaultValue={settings?.pathao_store_id || ""}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-red-500/50"
              >
                <option value="">Select a default store</option>
                {stores.map((s) => (
                  <option key={s.store_id} value={s.store_id}>
                    {s.store_name} {s.is_default_store ? "(Pathao Default)" : ""} {s.store_address ? `- ${s.store_address}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                name="store_id"
                defaultValue={settings?.pathao_store_id || ""}
                placeholder="Store ID (e.g. 369816)"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 focus:outline-none focus:border-red-500/50"
              />
            )}
            <p className="text-xs text-zinc-500">
              This store is automatically selected during order dispatches. As you dispatch, your most frequently used store will be maintained as default.
            </p>
          </div>
          <div className="pt-4">
            <SubmitButton className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium">
              Save Pathao Credentials
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
