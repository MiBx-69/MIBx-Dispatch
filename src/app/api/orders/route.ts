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
    const idsOnly = searchParams.get("idsOnly") === "true";
    const supabase = createServiceClient();

    let query: any = idsOnly
      ? supabase.from("orders").select("id").order("shopify_created_at", { ascending: false })
      : supabase
          .from("orders")
          .select("*", { count: "exact" })
          .order("shopify_created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);

    if (status === "archived") {
      query = query.eq("is_archived", true);
    } else if (status === "everything") {
      query = query.eq("is_archived", false);
    } else if (status === "in_progress" || status === "preparing") {
      query = query
        .eq("is_archived", false)
        .or("internal_status.in.(preparing,in_progress),fulfillment_status.in.(in_progress,partial)")
        .neq("internal_status", "dispatched")
        .neq("internal_status", "cancelled")
        .is("cancel_reason", null)
        .neq("financial_status", "voided")
        .is("pathao_consignment_id", null);
    } else if (status === "on_hold" || status === "hold") {
      query = query
        .eq("is_archived", false)
        .or("internal_status.in.(hold,on_hold),fulfillment_status.in.(on_hold,hold)")
        .neq("internal_status", "dispatched")
        .neq("internal_status", "cancelled")
        .is("cancel_reason", null)
        .neq("financial_status", "voided")
        .is("pathao_consignment_id", null);
    } else if (status === "dispatched") {
      query = query
        .eq("is_archived", false)
        .neq("internal_status", "cancelled")
        .is("cancel_reason", null)
        .neq("financial_status", "voided")
        .or("internal_status.eq.dispatched,fulfillment_status.eq.fulfilled");
    } else if (status === "pending") {
      query = query
        .eq("is_archived", false)
        .eq("internal_status", "pending")
        .not("fulfillment_status", "in", '("on_hold","in_progress","partial")')
        .neq("internal_status", "dispatched")
        .neq("internal_status", "cancelled")
        .is("cancel_reason", null)
        .neq("financial_status", "voided")
        .is("pathao_consignment_id", null);
    } else if (status === "unfulfilled") {
      query = query
        .eq("is_archived", false)
        .or("fulfillment_status.eq.unfulfilled,fulfillment_status.is.null")
        .neq("internal_status", "dispatched")
        .neq("internal_status", "cancelled")
        .is("cancel_reason", null)
        .neq("financial_status", "voided")
        .is("pathao_consignment_id", null);
    } else if (status === "cancelled") {
      query = query
        .eq("is_archived", false)
        .or("internal_status.eq.cancelled,cancel_reason.not.is.null,financial_status.eq.voided");
    } else if (status === "all") {
      query = query
        .eq("is_archived", false)
        .neq("internal_status", "dispatched")
        .neq("internal_status", "cancelled")
        .is("cancel_reason", null)
        .neq("financial_status", "voided")
        .is("pathao_consignment_id", null)
        .or("fulfillment_status.neq.fulfilled,fulfillment_status.is.null");
    } else {
      query = query.eq("is_archived", false).eq("internal_status", status);
    }

    const cleanSearch = (search || "").replace(/[,()]/g, " ").trim();
    if (cleanSearch) {
      query = query.or(
        `customer_name.ilike.%${cleanSearch}%,customer_phone.ilike.%${cleanSearch}%,shopify_order_name.ilike.%${cleanSearch}%,pathao_consignment_id.ilike.%${cleanSearch}%`
      );
    }

    const { data: orders, count, error } = await query;

    if (error) {
      if (error.code === 'PGRST103') {
        return NextResponse.json({ orders: [], total: count || 0 });
      }
      throw error;
    }

    if (idsOnly) {
      const ids = (orders || []).map((o: any) => o.id);
      return NextResponse.json({ ids, total: ids.length });
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
