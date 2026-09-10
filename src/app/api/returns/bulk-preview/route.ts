import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identifiers } = body; 

    if (!identifiers || !Array.isArray(identifiers) || identifiers.length === 0) {
      return NextResponse.json({ error: "identifiers is required (array)" }, { status: 400 });
    }

    const supabase = createServiceClient();
    
    const { data: orders, error: fetchErr } = await supabase
      .from("orders")
      .select("id, shopify_order_name, pathao_consignment_id, total_price, customer_name, internal_status")
      .or(`shopify_order_name.in.(${identifiers.map((i: string) => `"${i}"`).join(",")}),pathao_consignment_id.in.(${identifiers.map((i: string) => `"${i}"`).join(",")})`);

    if (fetchErr) throw fetchErr;

    // Check which ones have existing returns
    const matchedOrders = [];
    const existingReturns = new Set();
    if (orders && orders.length > 0) {
       const orderIds = orders.map((o: any) => o.id);
       const { data: returns } = await supabase.from("returns").select("order_id").in("order_id", orderIds);
       returns?.forEach((r: any) => existingReturns.add(r.order_id));

       for (const order of orders) {
           matchedOrders.push({
               ...order,
               has_existing_return: existingReturns.has(order.id)
           });
       }
    }

    // Find unmatched identifiers
    const matchedNames = new Set(orders?.map((o: any) => o.shopify_order_name));
    const matchedConsignments = new Set(orders?.map((o: any) => o.pathao_consignment_id));
    
    const unmatched = identifiers.filter((id: string) => !matchedNames.has(id) && !matchedConsignments.has(id));

    return NextResponse.json({
      matched: matchedOrders,
      unmatched
    });
  } catch (err: any) {
    console.error("POST /api/returns/bulk-preview error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
