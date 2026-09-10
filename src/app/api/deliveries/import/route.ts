import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identifiers, action = "execute" } = body; // Array of strings: shopify order names or tracking numbers

    if (!identifiers || !Array.isArray(identifiers) || identifiers.length === 0) {
      return NextResponse.json({ error: "Missing or invalid identifiers" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const errors: any[] = [];
    const processedIds: string[] = [];
    
    // For preview mode
    const matched: any[] = [];
    const unmatched: string[] = [];

    // Normalize identifiers (trim and handle potential # for shopify order names)
    const normalizedIdentifiers = identifiers.map(id => id.trim()).filter(id => id.length > 0);
    if (normalizedIdentifiers.length === 0) {
      return NextResponse.json({ error: "No valid identifiers provided" }, { status: 400 });
    }

    // Split into chunks of 100 to avoid query size limits
    const chunkSize = 100;
    for (let i = 0; i < normalizedIdentifiers.length; i += chunkSize) {
      const chunk = normalizedIdentifiers.slice(i, i + chunkSize);
      
      // Perform two separate queries to avoid PostgREST .or() string parsing issues with complex strings (like parentheses in names)
      const { data: matchedByName, error: fetchErr1 } = await supabase
        .from("orders")
        .select("id, internal_status, shopify_order_name, pathao_consignment_id, customer_name")
        .in("shopify_order_name", chunk);

      const { data: matchedByConsignment, error: fetchErr2 } = await supabase
        .from("orders")
        .select("id, internal_status, shopify_order_name, pathao_consignment_id, customer_name")
        .in("pathao_consignment_id", chunk);

      if (fetchErr1 || fetchErr2) {
        console.error("Bulk import fetch error:", fetchErr1 || fetchErr2);
        if (action === "execute") {
          errors.push({ batch: chunk, error: (fetchErr1 || fetchErr2)?.message });
        }
        continue;
      }

      // Merge results and deduplicate by ID
      const allMatched = [...(matchedByName || []), ...(matchedByConsignment || [])];
      const matchedMap = new Map();
      for (const order of allMatched) {
        matchedMap.set(order.id, order);
      }
      const matchedOrders = Array.from(matchedMap.values());

      const foundIdentifiers = new Set([
        ...matchedOrders.map(o => o.shopify_order_name),
        ...matchedOrders.map(o => o.pathao_consignment_id)
      ]);
      
      chunk.forEach(id => {
        if (!foundIdentifiers.has(id)) {
          if (action === "execute") {
            errors.push({ identifier: id, error: "Order not found" });
          } else {
            unmatched.push(id);
          }
        }
      });

      if (action === "preview") {
        matchedOrders.forEach(o => {
          matched.push({
            id: o.id,
            shopify_order_name: o.shopify_order_name,
            customer_name: o.customer_name,
            has_existing_delivery: o.internal_status === "delivered"
          });
        });
        continue;
      }

      // EXECUTE LOGIC
      const now = new Date().toISOString();
      const validOrderIds = matchedOrders
        .filter(o => o.internal_status !== "delivered")
        .map(o => o.id);

      matchedOrders.forEach(o => {
        if (o.internal_status === "delivered") {
          errors.push({ identifier: o.shopify_order_name || o.pathao_consignment_id, error: "Already marked as delivered" });
        }
      });

      if (validOrderIds.length > 0) {
        const { error: updateErr } = await supabase
          .from("orders")
          .update({
            internal_status: "delivered",
            delivered_at: now,
          })
          .in("id", validOrderIds);

        if (updateErr) {
          validOrderIds.forEach(id => errors.push({ identifier: id, error: `Failed to update: ${updateErr.message}` }));
        } else {
          processedIds.push(...validOrderIds);
        }
      }
    }

    if (action === "preview") {
      return NextResponse.json({
        success: true,
        matched,
        unmatched
      });
    }

    return NextResponse.json({
      success: true,
      processed: processedIds.length,
      errors,
    });
  } catch (error: any) {
    console.error("Bulk import error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
