import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFilter = searchParams.get("dateFilter") || "all";
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");

    const supabase = createServiceClient();

    let query = supabase
      .from("orders")
      .select("id, shopify_order_name, customer_name, customer_phone, total_price, delivered_at, shopify_created_at, pathao_consignment_id, pathao_delivery_status, delivery_address")
      .eq("is_archived", false)
      .eq("internal_status", "delivered")
      .order("delivered_at", { ascending: false });

    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,shopify_order_name.ilike.%${search}%,pathao_consignment_id.ilike.%${search}%`
      );
    }

    // Date range calculation
    let startDateStr = "";
    let endDateStr = "";
    const now = new Date();

    if (dateFilter === "today") {
      const today = new Date(now);
      startDateStr = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      endDateStr = new Date(today.setHours(23, 59, 59, 999)).toISOString();
    } else if (dateFilter === "last_7_days") {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      startDateStr = new Date(start.setHours(0, 0, 0, 0)).toISOString();
      endDateStr = new Date(now.setHours(23, 59, 59, 999)).toISOString();
    } else if (dateFilter === "last_30_days") {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      startDateStr = new Date(start.setHours(0, 0, 0, 0)).toISOString();
      endDateStr = new Date(now.setHours(23, 59, 59, 999)).toISOString();
    } else if (dateFilter === "this_month") {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      startDateStr = new Date(firstDay.setHours(0, 0, 0, 0)).toISOString();
      endDateStr = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    } else if (dateFilter === "last_month") {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      startDateStr = new Date(firstDayLastMonth.setHours(0, 0, 0, 0)).toISOString();
      endDateStr = lastDayLastMonth.toISOString();
    } else if (dateFilter === "custom" && startDate && endDate) {
      startDateStr = new Date(startDate).toISOString();
      const end = new Date(endDate);
      endDateStr = new Date(end.setHours(23, 59, 59, 999)).toISOString();
    }

    if (startDateStr && endDateStr) {
      query = query.gte("delivered_at", startDateStr).lte("delivered_at", endDateStr);
    }

    const { data: rawOrders, error } = await query;
    if (error) throw error;

    const orders = rawOrders || [];

    // Build CSV
    const headers = [
      "Order Number",
      "Customer Name",
      "Customer Phone",
      "Delivered Date",
      "Total Amount (BDT)",
      "Consignment ID",
      "Delivery Status",
      "Address"
    ];

    const rows = orders.map((o: any) => {
      const deliveredDate = o.delivered_at 
        ? new Date(o.delivered_at).toLocaleDateString("en-BD") + " " + new Date(o.delivered_at).toLocaleTimeString("en-BD", { hour: "2-digit", minute: "2-digit" })
        : "N/A";
      const address = (typeof o.delivery_address === "object" && o.delivery_address ? o.delivery_address.address : o.delivery_address) || "";

      return [
        `"${o.shopify_order_name || ''}"`,
        `"${(o.customer_name || '').replace(/"/g, '""')}"`,
        `"${o.customer_phone || ''}"`,
        `"${deliveredDate}"`,
        `"${Number(o.total_price || 0).toFixed(2)}"`,
        `"${o.pathao_consignment_id || ''}"`,
        `"${o.pathao_delivery_status || 'Delivered'}"`,
        `"${String(address).replace(/"/g, '""')}"`
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");
    const filename = `deliveries-report-${dateFilter}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (err: any) {
    console.error("GET /api/deliveries/export error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
