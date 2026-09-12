import { createServiceClient } from "@/lib/supabase/server";
import { AnalyticsClient } from "./analytics-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Delivery & COD Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const supabase = createServiceClient();

  // Fetch all active dispatches with order and customer details
  const { data: dispatches } = await supabase
    .from("dispatches")
    .select(`
      id,
      consignment_id,
      delivery_fee,
      dispatched_at,
      recipient_city,
      recipient_zone,
      recipient_address,
      pathao_order_status,
      is_cancelled,
      orders (
        id,
        shopify_order_name,
        total_price,
        internal_status,
        delivered_at,
        returned_at,
        shipping_address
      )
    `)
    .eq("is_cancelled", false)
    .order("dispatched_at", { ascending: false });

  return <AnalyticsClient dispatches={dispatches || []} />;
}
