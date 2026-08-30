import { createServiceClient, createClient } from "@/lib/supabase/server";
import { AccountTabs } from "./client-tabs";
import { redirect } from "next/navigation";

export const metadata = { title: "Account Settings" };

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const supabaseAdmin = createServiceClient();
  
  // Fetch current user's profile
  const { data: userProfile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  // Fetch all team profiles
  const { data: teamProfiles } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in">
      <div>
        <h2 className="text-lg font-bold text-zinc-100">Account & Team</h2>
        <p className="text-sm text-zinc-500">Manage your profile, security preferences, and team access.</p>
      </div>

      <AccountTabs userProfile={userProfile} teamProfiles={teamProfiles || []} />
    </div>
  );
}
