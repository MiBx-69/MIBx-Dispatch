import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envFile = fs.readFileSync(path.join(__dirname, ".env"), "utf-8");
const envVars = envFile.split("\n").reduce((acc, line) => {
  const [key, ...val] = line.split("=");
  if (key && val.length > 0) {
    acc[key.trim()] = val.join("=").trim().replace(/"/g, "").replace(/\r/g, "");
  }
  return acc;
}, {});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: logs, error } = await supabase.from('webhook_logs').select('*').limit(5);
  console.log("WEBHOOK LOGS:", JSON.stringify(logs, null, 2));
  console.log("ERROR:", error);
}

run().catch(console.error);
