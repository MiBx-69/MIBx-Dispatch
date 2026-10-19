import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { formatPathaoTrackingUrl } from "@/lib/pathao/client";
import {
  updateShopifyFulfillmentTracking,
  getShopifyOrderFulfillments,
  updateShopifyOrder,
} from "@/lib/shopify/client";
import { buildDispatchCombinedNote } from "@/lib/fraud-checker";
import { logOrderEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Auth check
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 2. Fetch order
  const { data: order, error: fetchErr } = await supabase
    .from("orders")
    .select("*, dispatches(*)")
    .eq("id", id)
    .single();

  if (fetchErr || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const consignmentId = order.pathao_consignment_id || order.dispatches?.[0]?.consignment_id;
  if (!consignmentId) {
    return NextResponse.json({ error: "Order does not have a Pathao consignment ID" }, { status: 400 });
  }

  const phone = order.dispatches?.[0]?.recipient_phone || order.customer_phone || (order.shipping_address as any)?.phone || "";
  const trackingUrl = formatPathaoTrackingUrl(consignmentId, phone);

  // 3. Update DB
  await supabase
    .from("orders")
    .update({ pathao_tracking_url: trackingUrl })
    .eq("id", order.id);

  let updatedShopifyFulfillment = false;
  let updatedShopifyNote = false;

  // 4. Update Shopify fulfillment tracking & note if shopify_order_id exists
  if (order.shopify_order_id) {
    try {
      let fulfillmentId = order.shopify_fulfillment_id;
      if (!fulfillmentId) {
        const fulfillments = await getShopifyOrderFulfillments(order.shopify_order_id);
        if (fulfillments.length > 0) {
          fulfillmentId = fulfillments[0].id;
          await supabase
            .from("orders")
            .update({ shopify_fulfillment_id: fulfillmentId })
            .eq("id", order.id);
        }
      }

      if (fulfillmentId) {
        await updateShopifyFulfillmentTracking({
          fulfillmentId,
          trackingNumber: consignmentId,
          trackingCompany: "Pathao",
          trackingUrl,
          notifyCustomer: false,
        });
        updatedShopifyFulfillment = true;
      }

      const combinedNote = buildDispatchCombinedNote({
        consignmentId,
        trackingUrl,
        existingNote: order.note,
      });

      await updateShopifyOrder({
        id: `gid://shopify/Order/${order.shopify_order_id}`,
        note: combinedNote,
      });
      await supabase
        .from("orders")
        .update({ note: combinedNote })
        .eq("id", order.id);
      updatedShopifyNote = true;
    } catch (shopifyErr: any) {
      console.error("[Tracking Route] Failed to update Shopify:", shopifyErr);
    }
  }

  await logOrderEvent(
    order.id,
    "TRACKING_SYNCED",
    `Pathao tracking link updated on Shopify and DB: ${trackingUrl}`,
    { consignmentId, trackingUrl, updatedShopifyFulfillment, updatedShopifyNote }
  );

  return NextResponse.json({
    success: true,
    consignmentId,
    trackingUrl,
    updatedShopifyFulfillment,
    updatedShopifyNote,
  });
}
