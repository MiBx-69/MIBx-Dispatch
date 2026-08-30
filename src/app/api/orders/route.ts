import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "25");
    const status = searchParams.get("status") || "all";
    const search = searchParams.get("search") || "";

    const offset = (page - 1) * pageSize;
    const supabase = createServiceClient();

    let query = supabase
      .from("orders")
      .select("*", { count: "exact" })
      .order("shopify_created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (status === "archived") {
      query = query.eq("is_archived", true);
    } else {
      query = query.eq("is_archived", false);
      if (status !== "all") {
        query = query.eq("internal_status", status);
      }
    }

    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,shopify_order_name.ilike.%${search}%,pathao_consignment_id.ilike.%${search}%`
      );
    }

    const { data: orders, count, error } = await query;

    if (error) throw error;

    return NextResponse.json({ orders, total: count });
  } catch (error: any) {
    console.error("Fetch orders error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
