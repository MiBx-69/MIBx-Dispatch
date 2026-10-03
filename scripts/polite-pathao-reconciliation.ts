import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const PATHAO_BASE_URL = process.env.PATHAO_BASE_URL || "https://api-hermes.pathao.com";

async function getAuthToken(): Promise<string> {
  const res = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/issue-token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PATHAO_CLIENT_ID,
      client_secret: process.env.PATHAO_CLIENT_SECRET,
      grant_type: "password",
      username: process.env.PATHAO_USERNAME,
      password: process.env.PATHAO_PASSWORD,
    }),
  });
  if (!res.ok) throw new Error(`Pathao auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function reconcileSeptemberOrders() {
  console.log("Authenticating with Pathao API...");
  const token = await getAuthToken();
  console.log("Authenticated successfully.");

  // Fetch September dispatches with consignment_id
  const { data: dispatches, error } = await supabase
    .from("dispatches")
    .select("id, consignment_id, order_id, pathao_order_status, amount_to_collect, shopify_order_name")
    .not("consignment_id", "is", null);

  if (error || !dispatches) {
    console.error("Error fetching dispatches:", error);
    return;
  }

  // Filter only those whose status might be outdated (e.g. Returned, Pickup Failed, order.pickup-failed, Waiting for Pickup, etc.)
  const candidates = dispatches.filter((d: any) => {
    if (!d.consignment_id || !d.consignment_id.includes("0926")) return false;
    const st = (d.pathao_order_status || "").toLowerCase();
    // Reconcile Returned (to check for Paid Return), and failed/pending (to check for Delivered)
    return st === "returned" || st === "return" || st.includes("fail") || st.includes("pickup") || st.includes("hub") || st === "pending";
  });

  console.log(`Checking ${candidates.length} candidates with Pathao with 300ms polite pause...`);

  let upgradedToPaidReturn = 0;
  let upgradedToDelivered = 0;
  let unchanged = 0;
  let errors = 0;

  for (let i = 0; i < candidates.length; i++) {
    const d = candidates[i];
    await sleep(350); // Polite rate limit avoidance

    try {
      const res = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/orders/${d.consignment_id}/info`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        if (res.status === 429) {
          console.warn(`Rate limit 429 on ${d.consignment_id}, pausing 5s...`);
          await sleep(5000);
          i--; // retry this item
          continue;
        }
        errors++;
        continue;
      }

      const json = await res.json();
      const pData = json.data;
      if (!pData) continue;

      const pStatus = (pData.order_status || "").trim();
      const pPayment = (pData.payment_status || "").trim().toLowerCase();
      const pLower = pStatus.toLowerCase();

      // Check if it's Delivered
      if (pLower === "delivered" || pLower.includes("partial") || pStatus === "order.paid") {
        if (d.pathao_order_status !== "Delivered") {
          console.log(`[Delivered] ${d.shopify_order_name} (${d.consignment_id}): was "${d.pathao_order_status}" -> now Delivered`);
          await supabase.from("dispatches").update({ pathao_order_status: "Delivered", updated_at: new Date().toISOString() }).eq("id", d.id);
          if (d.order_id) {
            await supabase.from("orders").update({ internal_status: "delivered", pathao_delivery_status: "Delivered", updated_at: new Date().toISOString() }).eq("id", d.order_id);
          }
          upgradedToDelivered++;
        }
      }
      // Check if it's Paid Return
      else if (pLower.includes("return") && pPayment === "paid") {
        if (d.pathao_order_status !== "Paid Return") {
          console.log(`[Paid Return] ${d.shopify_order_name} (${d.consignment_id}): was "${d.pathao_order_status}" -> now Paid Return`);
          await supabase.from("dispatches").update({ pathao_order_status: "Paid Return", updated_at: new Date().toISOString() }).eq("id", d.id);
          if (d.order_id) {
            await supabase.from("orders").update({ internal_status: "returned", pathao_delivery_status: "Paid Return", return_reason: "Paid Return via Pathao", updated_at: new Date().toISOString() }).eq("id", d.order_id);
          }
          upgradedToPaidReturn++;
        }
      } else {
        unchanged++;
      }
    } catch (e: any) {
      errors++;
    }

    if ((i + 1) % 25 === 0 || i + 1 === candidates.length) {
      console.log(`Progress: ${i + 1}/${candidates.length} (Delivered +${upgradedToDelivered}, PaidReturn +${upgradedToPaidReturn})`);
    }
  }

  console.log("\n--- Reconciliation Finished ---");
  console.log(`Upgraded to Delivered: ${upgradedToDelivered}`);
  console.log(`Upgraded to Paid Return: ${upgradedToPaidReturn}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Errors: ${errors}`);
}

reconcileSeptemberOrders().catch(console.error);
