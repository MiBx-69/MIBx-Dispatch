import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { OrderDetailClient } from "./order-detail-client";

export const dynamic = "force-dynamic";

interface OrderDetailPageProps {
  params: Promise<{ id: string }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function OrderDetailPage({ params }: OrderDetailPageProps) {
  const { id } = await params;
  const supabase = createServiceClient();

  const cleanId = decodeURIComponent(id).trim();
  const altId = cleanId.startsWith("#") ? cleanId.slice(1) : `#${cleanId}`;

  let query = supabase.from("orders").select(`
      *,
      dispatches (
        id,
        consignment_id,
        pathao_order_status,
        tracking_history,
        dispatched_at,
        is_cancelled
      ),
      returns (
        *
      )
    `);

  const isNumeric = /^\d+$/.test(cleanId);
  const isUUID = UUID_REGEX.test(cleanId);

  const orConditions: string[] = [];
  if (isUUID) {
    orConditions.push(`id.eq.${cleanId}`);
  }
  if (isNumeric) {
    orConditions.push(`shopify_order_id.eq.${Number(cleanId)}`);
  }
  orConditions.push(`shopify_order_name.eq.${cleanId}`);
  orConditions.push(`shopify_order_name.eq.${altId}`);

  if (orConditions.length > 0) {
    query = query.or(orConditions.join(","));
  }

  const { data: orders } = await query.limit(1);
  const order = orders?.[0];

  if (!order) {
    return notFound();
  }

  const { data: settings } = await supabase
    .from("app_settings")
    .select("pathao_store_id")
    .single();

  return (
    <OrderDetailClient
      order={order}
      pathaoStoreId={settings?.pathao_store_id || null}
    />
  );
}

