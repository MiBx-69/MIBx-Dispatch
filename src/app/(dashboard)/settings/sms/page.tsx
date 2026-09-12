import { createServiceClient } from "@/lib/supabase/server";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { SMSSettingsForm } from "./sms-settings-form";
import { TestSMSForm } from "./test-form";

export const metadata = { title: "SMS Configuration & Notifications" };

export default async function SMSSettingsPage() {
  const supabase = createServiceClient();
  const { data: settings } = await supabase.from("app_settings").select("*").single();

  return (
    <div className="space-y-6 max-w-4xl animate-fade-in pb-12">
      {/* Page Header */}
      <div>
        <Link
          href="/settings"
          className="text-indigo-400 hover:text-indigo-300 text-xs font-medium mb-2 inline-flex items-center gap-1"
        >
          &larr; Back to Settings
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-100 flex items-center gap-2.5">
              <MessageSquare className="w-5 h-5 text-indigo-400" />
              SMS Notification Configuration
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Configure your SMS gateway credentials, toggle automated triggers, and customize templates for every stage.
            </p>
          </div>
        </div>
      </div>

      {/* Main SMS Form: Credentials + 7 Customizable Notification Triggers */}
      <SMSSettingsForm settings={settings} />

      {/* Test SMS Form */}
      <TestSMSForm />
    </div>
  );
}
