import { config } from "dotenv";
config({ path: ".env" });
import { createClient } from "@supabase/supabase-js";

async function run() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("webhook_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) console.error("Error fetching logs:", error);
  else console.log("Recent Webhook Logs:", data);
}
run();
