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

async function syncAllSeptemberPathao() {
  console.log("1. Authenticating with Pathao API...");
  const token = await getAuthToken();
  console.log("Authenticated successfully.");

  // Fetch all dispatches in September
  const start = "2026-08-31T18:00:00.000Z";
  const end = "2026-09-30T17:59:59.999Z";

  const { data: dispatches, error } = await supabase
    .from("dispatches")
    .select("id, consignment_id, order_id, pathao_order_status, amount_to_collect, shopify_order_name")
    .not("consignment_id", "is", null);

  if (error || !dispatches) {
    console.error("Failed to fetch dispatches:", error);
    return;
  }

  // Filter to consignments that belong to September (by dispatched_at or CN prefix DU...0926)
  const septDispatches = dispatches.filter((d: any) => {
    return d.consignment_id && d.consignment_id.includes("0926");
  });

  console.log(`Found ${septDispatches.length} September consignments to check with Pathao.`);

  let deliveredCount = 0;
  let paidReturnCount = 0;
  let returnedCount = 0;
  let failedCount = 0;
  let processingCount = 0;
  let otherCount = 0;

  const concurrency = 10;
  let completed = 0;

  async function checkDispatch(d: any) {
    try {
      const res = await fetch(`${PATHAO_BASE_URL}/aladdin/api/v1/orders/${d.consignment_id}/info`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        return;
      }

      const json = await res.json();
      const data = json.data;
      if (!data) return;

      const orderStatus = (data.order_status || "").trim();
      const paymentStatus = (data.payment_status || "").trim().toLowerCase();
      const stLower = orderStatus.toLowerCase();

      let normalizedStatus = orderStatus;
      let internalStatus = "dispatched";

      if (stLower === "delivered" || stLower.includes("partial") || orderStatus === "order.paid") {
        normalizedStatus = "Delivered";
        internalStatus = "delivered";
        deliveredCount++;
      } else if (stLower.includes("return") && paymentStatus === "paid") {
        normalizedStatus = "Paid Return";
        internalStatus = "returned";
        paidReturnCount++;
      } else if (stLower.includes("return")) {
        normalizedStatus = "Returned";
        internalStatus = "returned";
        returnedCount++;
      } else if (stLower.includes("fail") || stLower.includes("cancel")) {
        normalizedStatus = "Pickup Failed";
        internalStatus = "hold";
        failedCount++;
      } else if (stLower.includes("way") || stLower.includes("hub") || stLower.includes("delivery")) {
        normalizedStatus = "Delivery Processing";
        internalStatus = "dispatched";
        processingCount++;
      } else {
        otherCount++;
      }

      // Update dispatch
      await supabase
        .from("dispatches")
        .update({
          pathao_order_status: normalizedStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", d.id);

      // Update linked order if exists
      if (d.order_id) {
        const updatePayload: any = {
          pathao_delivery_status: normalizedStatus,
          internal_status: internalStatus,
          updated_at: new Date().toISOString(),
        };
        if (internalStatus === "returned") {
          updatePayload.return_reason = normalizedStatus === "Paid Return" ? "Paid Return via Pathao" : "Returned via Pathao";
        }
        await supabase
          .from("orders")
          .update(updatePayload)
          .eq("id", d.order_id);
      }
    } catch (e: any) {
      // ignore individual network errors
    } finally {
      completed++;
      if (completed % 50 === 0 || completed === septDispatches.length) {
        console.log(`Progress: ${completed}/${septDispatches.length}`);
      }
    }
  }

  // Run with bounded concurrency
  let index = 0;
  const workers = new Array(concurrency).fill(null).map(async () => {
    while (index < septDispatches.length) {
      const idx = index++;
      await checkDispatch(septDispatches[idx]);
      await new Promise((r) => setTimeout(r, 40));
    }
  });

  await Promise.all(workers);

  console.log("\n================ PATHAO SYNC COMPLETE ================");
  console.log(`Delivered: ${deliveredCount}`);
  console.log(`Paid Return: ${paidReturnCount}`);
  console.log(`Returned: ${returnedCount}`);
  console.log(`Pickup Failed: ${failedCount}`);
  console.log(`Delivery Processing: ${processingCount}`);
  console.log(`Other: ${otherCount}`);
  console.log("======================================================");
}

syncAllSeptemberPathao().catch(console.error);
