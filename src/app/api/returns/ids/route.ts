import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const filter = searchParams.get("filter");
    const search = searchParams.get("search");

    const supabase = createServiceClient();

    let query: any = search
      ? supabase.from("returns").select(`
          id,
          consignment_id,
          return_reason,
          orders!inner (
            shopify_order_name,
            customer_name,
            customer_phone
          )
        `)
      : supabase.from("returns").select("id");

    if (search) {
      const cleanSearch = search.replace(/[,()]/g, " ").trim();
      if (cleanSearch) {
        query = query.or(`consignment_id.ilike.%${cleanSearch}%,return_reason.ilike.%${cleanSearch}%,orders.shopify_order_name.ilike.%${cleanSearch}%,orders.customer_name.ilike.%${cleanSearch}%,orders.customer_phone.ilike.%${cleanSearch}%`);
      }
    }

    if (filter && filter !== "all") {
      query = query.eq("status", filter);
    }

    query = query.order("returned_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    const ids = (data || []).map((r: any) => r.id);
    return NextResponse.json({ ids, total: ids.length });
  } catch (err: any) {
    console.error("GET /api/returns/ids error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
