import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// GET /api/returns — List all returns with optional date filtering
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status");
    const source = searchParams.get("source");

    const supabase = createServiceClient();

    let query = supabase
      .from("returns")
      .select(`
        *,
        orders (
          id,
          shopify_order_name,
          customer_name,
          customer_phone,
          total_price,
          subtotal_price,
          line_items,
          pathao_consignment_id,
          shopify_created_at
        )
      `)
      .order("returned_at", { ascending: false });

    if (startDate) query = query.gte("returned_at", startDate);
    if (endDate) query = query.lte("returned_at", endDate);
    if (status) query = query.eq("status", status);
    if (source) query = query.eq("return_source", source);

    const { data, error } = await query;

    if (error) throw error;

    return NextResponse.json({ returns: data || [] });
  } catch (err: any) {
    console.error("GET /api/returns error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST /api/returns — Manually mark order(s) as returned
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      orderIds,         // string[] — one or more order IDs to mark as returned
      return_reason,    // string
      return_type = "full",
      return_delivery_fee = 0,
      notes,
      returned_items = null, // Array of items for partial returns
    } = body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: "orderIds is required (array)" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const results: any[] = [];
    const errors: any[] = [];

    for (const orderId of orderIds) {
      // Fetch the order
      const { data: order, error: fetchErr } = await supabase
        .from("orders")
        .select("id, internal_status, total_price, pathao_consignment_id, shopify_order_name")
        .eq("id", orderId)
        .single();

      if (fetchErr || !order) {
        errors.push({ orderId, error: "Order not found" });
        continue;
      }

      // Status restriction removed as per user request: "STSTUS DONT METER RETURN MEANS RETURN"

      // Check if already has a return record
      const { data: existingReturn } = await supabase
        .from("returns")
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle();

      if (existingReturn) {
        errors.push({ orderId, error: "Return already exists for this order" });
        continue;
      }

      const now = new Date().toISOString();

      // Find the dispatch record if any
      const { data: dispatch } = await supabase
        .from("dispatches")
        .select("id, consignment_id")
        .eq("order_id", orderId)
        .eq("is_cancelled", false)
        .maybeSingle();

      const isPartial = return_type === "partial";
      const initialStatus = isPartial ? "pending_verification" : "received";

      // Create return record
      const { error: insertErr } = await supabase.from("returns").insert({
        order_id: orderId,
        dispatch_id: dispatch?.id || null,
        consignment_id: dispatch?.consignment_id || order.pathao_consignment_id || null,
        return_reason: return_reason || null,
        return_type,
        return_source: "manual",
        order_total: Number(order.total_price) || 0,
        return_delivery_fee: Number(return_delivery_fee) || 0,
        is_paid_return: !!body.is_paid_return,
        status: initialStatus,
        is_verified: !isPartial, // Partial needs admin verification
        returned_items: isPartial ? returned_items : null,
        notes: notes || null,
        returned_at: now,
      });

      if (insertErr) {
        errors.push({ orderId, error: insertErr.message });
        continue;
      }

      // Update order status ONLY for full returns
      if (!isPartial) {
        await supabase.from("orders").update({
          internal_status: "returned",
          returned_at: now,
          return_reason: return_reason || null,
          return_delivery_fee: Number(return_delivery_fee) || 0,
        }).eq("id", orderId);
      }

      results.push({ orderId, name: order.shopify_order_name, success: true });
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (err: any) {
    console.error("POST /api/returns error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
