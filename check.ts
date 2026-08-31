import { config } from "dotenv";
config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: logs } = await supabase
    .from("webhook_logs")
    .select("topic, processed, error, created_at, source")
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("Recent Webhooks:", logs);

  const { data: settings } = await supabase
    .from("app_settings")
    .select("sms_auto_order_enabled, sms_api_key")
    .single();

  console.log("Settings:", !!settings?.sms_api_key, settings?.sms_auto_order_enabled);
}

check();
