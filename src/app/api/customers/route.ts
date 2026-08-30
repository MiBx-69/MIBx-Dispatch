import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const sort = searchParams.get("sort") || "orders"; // "orders", "spent", "newest"
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");
    const offset = (page - 1) * pageSize;

    const supabase = createServiceClient();

    let query = supabase
      .from("customers")
      .select("*", { count: "exact" });

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (sort === "orders") {
      query = query.order("total_orders", { ascending: false });
    } else if (sort === "spent") {
      query = query.order("total_spent", { ascending: false });
    } else if (sort === "newest") {
      query = query.order("shopify_created_at", { ascending: false });
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;

    if (error) {
      // Handle Supabase out-of-range pagination errors gracefully
      if (error.code === "PGRST103") {
        return NextResponse.json({ customers: [], total: count || 0, hasMore: false });
      }
      throw error;
    }

    const hasMore = count ? offset + pageSize < count : false;

    return NextResponse.json({
      customers: data || [],
      total: count || 0,
      hasMore,
    });
  } catch (error: any) {
    console.error("Fetch customers error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch customers" },
      { status: 500 }
    );
  }
}
