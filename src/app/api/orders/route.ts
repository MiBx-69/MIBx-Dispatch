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
    } else if (status === "everything") {
      query = query.eq("is_archived", false);
    } else if (status === "in_progress") {
      query = query.eq("is_archived", false).eq("fulfillment_status", "in_progress").neq("internal_status", "dispatched");
    } else if (status === "dispatched") {
      query = query.eq("is_archived", false).or("internal_status.eq.dispatched,fulfillment_status.eq.fulfilled");
    } else if (status === "unfulfilled") {
      query = query.eq("is_archived", false)
                   .eq("fulfillment_status", "unfulfilled")
                   .neq("internal_status", "dispatched")
                   .neq("internal_status", "cancelled");
    } else if (status === "on_hold") {
      query = query.eq("is_archived", false)
                   .eq("fulfillment_status", "on_hold")
                   .neq("internal_status", "dispatched");
    } else if (status === "all") {
      query = query.eq("is_archived", false)
                   .neq("internal_status", "dispatched")
                   .neq("internal_status", "cancelled")
                   .neq("fulfillment_status", "fulfilled");
    } else {
      query = query.eq("is_archived", false).eq("internal_status", status);
    }

    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,shopify_order_name.ilike.%${search}%,pathao_consignment_id.ilike.%${search}%`
      );
    }

    const { data: orders, count, error } = await query;

    if (error) {
      if (error.code === 'PGRST103') {
        return NextResponse.json({ orders: [], total: count || 0 });
      }
      throw error;
    }

    return NextResponse.json({ orders, total: count });
  } catch (error: any) {
    console.error("Fetch orders error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch orders" },
      { status: 500 }
    );
  }
}
