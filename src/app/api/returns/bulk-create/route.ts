import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identifiers, is_paid_return, return_delivery_fee } = body; // Array of strings (order names or consignment IDs)

    if (!identifiers || !Array.isArray(identifiers) || identifiers.length === 0) {
      return NextResponse.json({ error: "identifiers is required (array)" }, { status: 400 });
    }

    const isPaid = !!is_paid_return;
    const deliveryFee = isPaid 
      ? 0 
      : (return_delivery_fee !== undefined && return_delivery_fee !== null ? Number(return_delivery_fee) : 0);

    const supabase = createServiceClient();
    
    // Find all matching orders
    // identifiers could be pathao_consignment_id or shopify_order_name
    const { data: orders, error: fetchErr } = await supabase
      .from("orders")
      .select("id, shopify_order_name, pathao_consignment_id, total_price")
      .or(`shopify_order_name.in.(${identifiers.map((i: string) => `"${i}"`).join(",")}),pathao_consignment_id.in.(${identifiers.map((i: string) => `"${i}"`).join(",")})`);

    if (fetchErr) throw fetchErr;

    if (!orders || orders.length === 0) {
      return NextResponse.json({ error: "No matching orders found for provided identifiers" }, { status: 404 });
    }

    const orderIds = orders.map((o: any) => o.id);
    const now = new Date().toISOString();
    
    const results: any[] = [];
    const errors: any[] = [];

    for (const order of orders) {
      // Check if return exists
      const { data: existingReturn } = await supabase
        .from("returns")
        .select("id")
        .eq("order_id", order.id)
        .maybeSingle();

      if (existingReturn) {
        errors.push({ identifier: order.shopify_order_name, error: "Return already exists" });
        continue;
      }

      // Find dispatch
      const { data: dispatch } = await supabase
        .from("dispatches")
        .select("id, consignment_id")
        .eq("order_id", order.id)
        .eq("is_cancelled", false)
        .maybeSingle();

      // Insert full return
      const { error: insertErr } = await supabase.from("returns").insert({
        order_id: order.id,
        dispatch_id: dispatch?.id || null,
        consignment_id: dispatch?.consignment_id || order.pathao_consignment_id || null,
        return_type: "full",
        return_source: "manual",
        order_total: Number(order.total_price) || 0,
        return_delivery_fee: deliveryFee,
        is_paid_return: isPaid,
        status: "received",
        is_verified: true,
        returned_at: now,
      });

      if (insertErr) {
        errors.push({ identifier: order.shopify_order_name, error: insertErr.message });
      } else {
        await supabase.from("orders").update({
          internal_status: "returned",
          returned_at: now,
          return_delivery_fee: deliveryFee,
        }).eq("id", order.id);
        
        results.push({ identifier: order.shopify_order_name, success: true });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      failed: errors.length,
      results,
      errors,
    });
  } catch (err: any) {
    console.error("POST /api/returns/bulk-create error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
