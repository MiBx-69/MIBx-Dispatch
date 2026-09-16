import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixPartialReturns() {
  const { data: returns, error: err } = await supabase
    .from("returns")
    .select("*, orders(shopify_order_name, pathao_delivery_status, internal_status), dispatches(pathao_order_status, consignment_id)")
    .eq("return_type", "partial")
    .eq("return_source", "shopify_webhook");

  if (!returns) return;

  for (const r of returns) {
    if (r.orders?.internal_status !== "delivered") {
      console.log(`Deleting invalid return record for order ${r.orders?.shopify_order_name} (internal_status: ${r.orders?.internal_status})`);
      await supabase.from("returns").delete().eq("id", r.id);
    }
  }

  // Also check if any orders have pathao_delivery_status = "Partial Delivered" but are not internal_status "delivered"
  // Wait, if an order is NOT delivered, but its pathao_delivery_status is "Partial Delivered", we should clear it if it doesn't match its dispatch status.
  const { data: orders } = await supabase
    .from("orders")
    .select("id, shopify_order_name, internal_status, pathao_delivery_status, dispatches(pathao_order_status)")
    .eq("pathao_delivery_status", "Partial Delivered");
    
  if (orders) {
    for (const o of orders) {
      if (o.internal_status !== "delivered") {
         const dispatchStatus = Array.isArray(o.dispatches) && o.dispatches.length > 0 ? o.dispatches[0].pathao_order_status : (o.dispatches as any)?.pathao_order_status;
         if (dispatchStatus && dispatchStatus !== "Partial Delivered") {
           console.log(`Fixing pathao_delivery_status for order ${o.shopify_order_name} to match dispatch: ${dispatchStatus}`);
           await supabase.from("orders").update({ pathao_delivery_status: dispatchStatus }).eq("id", o.id);
         } else if (!dispatchStatus) {
           console.log(`Fixing pathao_delivery_status for order ${o.shopify_order_name} to Pending`);
           await supabase.from("orders").update({ pathao_delivery_status: "Pending" }).eq("id", o.id);
         }
      }
    }
  }
}

fixPartialReturns().catch(console.error);
