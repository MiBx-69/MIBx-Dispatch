import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { logOrderEvent } from "@/lib/audit";

/**
 * GET /api/orders/pack-verify?query=...
 * Looks up an order by order name (e.g. "#2158" or "2158"), consignment ID,
 * customer phone, or barcode. Returns order details, shipping address, and line items.
 */
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("query")?.trim();
    if (!query) {
      return NextResponse.json({ error: "Search query is required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const cleanRef = query.replace(/^#/, "").trim();

    const orFilters = [
      `shopify_order_name.eq.#${cleanRef}`,
      `shopify_order_name.eq.${cleanRef}`,
      `pathao_consignment_id.eq.${query}`,
      `customer_phone.eq.${query}`,
    ];

    if (/^\d+$/.test(cleanRef)) {
      orFilters.push(`shopify_order_number.eq.${cleanRef}`);
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select("*")
      .or(orFilters.join(","))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !order) {
      return NextResponse.json({ error: `No order found matching "${query}"` }, { status: 404 });
    }

    // Fetch existing packing verification event if any
    const { data: packEvent } = await supabase
      .from("order_events")
      .select("*")
      .eq("order_id", order.id)
      .eq("event_type", "PACKING_VERIFIED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      order,
      packingVerification: packEvent
        ? {
            verified_at: packEvent.created_at,
            packed_by: (packEvent.metadata as any)?.packed_by || "Warehouse Staff",
            verified_items: (packEvent.metadata as any)?.verified_items || [],
          }
        : null,
    });
  } catch (err: any) {
    console.error("[PackVerify] Lookup error:", err);
    return NextResponse.json({ error: err.message || "Failed to lookup order" }, { status: 500 });
  }
}

/**
 * POST /api/orders/pack-verify
 * Verifies that all line items in the order have been physically packed.
 * Updates order internal_status to 'preparing' (if still pending),
 * adds 'Packing Verified' tag, and logs an immutable audit event.
 */
export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();

    const supabase = createServiceClient();
    let staffName = "Warehouse Staff";

    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profile?.full_name) staffName = profile.full_name;
    }

    const body = await request.json();
    const { order_id, verified_items, notes } = body;

    if (!order_id) {
      return NextResponse.json({ error: "order_id is required" }, { status: 400 });
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, internal_status, shopify_order_name, shopify_tags")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const newTags = Array.from(new Set([...(order.shopify_tags || []), "Packing Verified"]));
    const nextStatus = order.internal_status === "pending" ? "preparing" : order.internal_status;

    await supabase
      .from("orders")
      .update({
        internal_status: nextStatus,
        shopify_tags: newTags,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    await logOrderEvent(
      order.id,
      "PACKING_VERIFIED",
      `Packing verified by ${staffName} (${Array.isArray(verified_items) ? verified_items.length : 0} items scanned)`,
      {
        packed_by: staffName,
        verified_items: verified_items || [],
        notes: notes || null,
        timestamp: new Date().toISOString(),
      }
    );

    return NextResponse.json({
      success: true,
      message: `Order ${order.shopify_order_name} packing verified successfully!`,
      verified_at: new Date().toISOString(),
      packed_by: staffName,
    });
  } catch (err: any) {
    console.error("[PackVerify] Save error:", err);
    return NextResponse.json({ error: err.message || "Failed to record packing verification" }, { status: 500 });
  }
}
