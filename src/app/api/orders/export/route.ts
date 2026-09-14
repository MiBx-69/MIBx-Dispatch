import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get("status") || "all";
  const search = searchParams.get("search") || "";

  const supabase = createServiceClient();
  let query = supabase.from("orders").select("*, dispatches(pathao_order_status, dispatched_at, is_cancelled)").order("shopify_created_at", { ascending: false });

  if (status === "in_progress") {
    query = query.eq("fulfillment_status", "in_progress");
  } else if (status !== "all") {
    query = query.eq("internal_status", status);
  }

  if (search) {
    query = query.or(
      `shopify_order_name.ilike.%${search}%,customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,customer_email.ilike.%${search}%,pathao_consignment_id.ilike.%${search}%`
    );
  }

  const { data: orders, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!orders || orders.length === 0) {
    return NextResponse.json({ error: "No orders found to export" }, { status: 404 });
  }

  // Create CSV header
  const headers = [
    "Order ID",
    "Internal Status",
    "Customer Name",
    "Customer Phone",
    "Total Price",
    "Financial Status",
    "Pathao Consignment ID",
    "Courier Status",
    "Dispatch Date",
    "Created At"
  ].join(",");

  // Create CSV rows
  const rows = orders.map((order: any) => {
    let courierStatus = order.pathao_delivery_status || "";
    let dispatchDate = "";
    
    if (order.dispatches && Array.isArray(order.dispatches)) {
      const activeDispatch = order.dispatches.find((d: any) => !d.is_cancelled) || order.dispatches[0];
      if (activeDispatch) {
        courierStatus = activeDispatch.pathao_order_status || courierStatus;
        if (activeDispatch.dispatched_at) {
          dispatchDate = new Date(activeDispatch.dispatched_at).toLocaleString();
        }
      }
    }

    return [
      `"${order.shopify_order_name}"`,
      `"${order.internal_status}"`,
      `"${order.customer_name?.replace(/"/g, '""')}"`,
      `"${order.customer_phone || ""}"`,
      `"${order.total_price} ${order.currency}"`,
      `"${order.financial_status || ""}"`,
      `"${order.pathao_consignment_id || ""}"`,
      `"${courierStatus}"`,
      `"${dispatchDate}"`,
      `"${new Date(order.shopify_created_at || order.created_at).toLocaleString()}"`
    ].join(",");
  });

  const csv = "\uFEFF" + [headers, ...rows].join("\n");

  const response = new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });

  return response;
}
