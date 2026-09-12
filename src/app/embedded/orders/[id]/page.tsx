import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { EmbeddedOrderClient } from "./embedded-order-client";

export const dynamic = "force-dynamic";

interface EmbeddedOrderPageProps {
  params: Promise<{ id: string }>;
}

export default async function EmbeddedOrderPage({ params }: EmbeddedOrderPageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const cleanId = decodeURIComponent(id).trim();
  const altId = cleanId.startsWith("#") ? cleanId.slice(1) : `#${cleanId}`;

  // Query order by internal ID, shopify_order_id (number or string), or shopify_order_name
  let query = supabase
    .from("orders")
    .select(`
      *,
      customers (
        name,
        phone,
        email,
        total_orders,
        delivery_success_rate
      ),
      dispatches (
        id,
        consignment_id,
        pathao_order_status,
        tracking_history,
        dispatched_at,
        is_cancelled
      )
    `);

  // If numeric, also check shopify_order_id
  const isNumeric = /^\d+$/.test(cleanId);
  if (isNumeric) {
    query = query.or(`id.eq.${cleanId},shopify_order_id.eq.${Number(cleanId)},shopify_order_name.eq.${cleanId},shopify_order_name.eq.${altId}`);
  } else {
    query = query.or(`id.eq.${cleanId},shopify_order_name.eq.${cleanId},shopify_order_name.eq.${altId}`);
  }

  const { data: orders } = await query.limit(1);
  const order = orders?.[0];

  if (!order) {
    return notFound();
  }

  // Get active settings for Pathao store
  const { data: settings } = await supabase.from("app_settings").select("pathao_store_id").single();

  return (
    <EmbeddedOrderClient
      order={order}
      pathaoStoreId={settings?.pathao_store_id || null}
    />
  );
}
