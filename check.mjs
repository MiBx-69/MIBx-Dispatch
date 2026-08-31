import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extract env vars manually to avoid dotenv
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
  const { data: settings } = await supabase.from("app_settings").select("shopify_shop_domain, shopify_access_token").single();
  const domain = settings.shopify_shop_domain;
  const token = settings.shopify_access_token;
  
  const query = `
    query {
      orders(first: 5, query: "name:1509") {
        edges {
          node {
            name
            totalPriceSet { shopMoney { amount } }
            currentTotalPriceSet { shopMoney { amount } }
            lineItems(first: 10) {
              edges {
                node {
                  title
                  quantity
                  currentQuantity
                  refundableQuantity
                  originalUnitPriceSet { shopMoney { amount } }
                }
              }
            }
          }
        }
      }
    }
  `;
  
  const res = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query })
  });
  
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

run().catch(console.error);
