import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function resyncMismatchedStatuses() {
  console.log("Starting courier status resynchronization...");

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, shopify_order_name, total_price, internal_status, pathao_delivery_status, pathao_consignment_id, dispatches(id, consignment_id, pathao_order_status)")
    .eq("internal_status", "delivered");

  if (error || !orders) {
    console.error("Failed to fetch orders:", error);
    return;
  }

  let paidReturnFixed = 0;
  let returnedFixed = 0;
  let failedFixed = 0;

  for (const o of orders) {
    const disp = Array.isArray(o.dispatches) && o.dispatches.length > 0 
      ? o.dispatches.sort((a, b) => (b.id || 0) - (a.id || 0))[0] 
      : null;
    const dStatus = (disp?.pathao_order_status || "").toLowerCase().trim();
    const pStatus = (o.pathao_delivery_status || "").toLowerCase().trim();

    // 1. Paid Return
    if (dStatus === "paid return" || pStatus === "paid return" || dStatus.includes("paid-return")) {
      console.log(`Fixing ${o.shopify_order_name} -> Paid Return`);
      await supabase.from("orders").update({
        internal_status: "returned",
        pathao_delivery_status: "Paid Return",
        return_reason: "Paid Return via Pathao",
        updated_at: new Date().toISOString(),
      }).eq("id", o.id);

      if (disp?.id) {
        await supabase.from("dispatches").update({
          pathao_order_status: "Paid Return",
          updated_at: new Date().toISOString(),
        }).eq("id", disp.id);
      }

      // Check return record
      const { data: existingReturn } = await supabase
        .from("returns")
        .select("id")
        .eq("order_id", o.id)
        .maybeSingle();

      if (!existingReturn) {
        await supabase.from("returns").insert({
          order_id: o.id,
          dispatch_id: disp?.id || null,
          consignment_id: o.pathao_consignment_id || disp?.consignment_id || null,
          return_type: "paid_return",
          return_source: "pathao_sync",
          order_total: Number(o.total_price) || 0,
          return_delivery_fee: 0,
          status: "processed",
          is_verified: true,
          return_reason: "Paid Return via Pathao",
          returned_at: new Date().toISOString(),
        });
      }

      paidReturnFixed++;
    } 
    // 2. Standard Returned
    else if (dStatus.includes("return") || pStatus.includes("return")) {
      console.log(`Fixing ${o.shopify_order_name} -> Returned`);
      await supabase.from("orders").update({
        internal_status: "returned",
        pathao_delivery_status: "Returned",
        return_reason: "Returned via Pathao",
        updated_at: new Date().toISOString(),
      }).eq("id", o.id);

      if (disp?.id) {
        await supabase.from("dispatches").update({
          pathao_order_status: "Returned",
          updated_at: new Date().toISOString(),
        }).eq("id", disp.id);
      }

      // Check return record
      const { data: existingReturn } = await supabase
        .from("returns")
        .select("id")
        .eq("order_id", o.id)
        .maybeSingle();

      if (!existingReturn) {
        await supabase.from("returns").insert({
          order_id: o.id,
          dispatch_id: disp?.id || null,
          consignment_id: o.pathao_consignment_id || disp?.consignment_id || null,
          return_type: "full",
          return_source: "pathao_sync",
          order_total: Number(o.total_price) || 0,
          return_delivery_fee: 110,
          status: "received",
          is_verified: true,
          return_reason: "Returned via Pathao",
          returned_at: new Date().toISOString(),
        });
      }

      returnedFixed++;
    } 
    // 3. Pickup Failed or Cancel
    else if (dStatus.includes("fail") || pStatus.includes("fail") || dStatus.includes("pickup cancel") || pStatus.includes("pickup cancel")) {
      const isCancel = dStatus.includes("cancel") || pStatus.includes("cancel");
      const targetInternal = isCancel ? "cancelled" : "hold";
      const targetPathao = isCancel ? "Pickup Cancel" : "Pickup Failed";

      console.log(`Fixing ${o.shopify_order_name} -> ${targetInternal} (${targetPathao})`);
      await supabase.from("orders").update({
        internal_status: targetInternal,
        pathao_delivery_status: targetPathao,
        delivered_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", o.id);

      failedFixed++;
    }
  }

  console.log("\n--- Resync Complete ---");
  console.log(`Fixed Paid Returns: ${paidReturnFixed}`);
  console.log(`Fixed Returns: ${returnedFixed}`);
  console.log(`Fixed Failed/Cancel to Hold/Cancelled: ${failedFixed}`);
  console.log(`Total orders corrected: ${paidReturnFixed + returnedFixed + failedFixed}`);
}

resyncMismatchedStatuses().catch(console.error);
