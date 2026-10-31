import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveDateRange, formatBstDate } from "@/lib/date-utils";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateFilter = searchParams.get("dateFilter") || "all";
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const search = searchParams.get("search");

    const supabase = createServiceClient();

    let query = supabase
      .from("orders")
      .select(
        "id, shopify_order_name, customer_name, customer_phone, total_price, original_total_price, delivered_at, shopify_created_at, pathao_consignment_id, pathao_delivery_status, shipping_address"
      )
      .eq("is_archived", false)
      .eq("internal_status", "delivered")
      .order("delivered_at", { ascending: false });

    if (search) {
      query = query.or(
        `customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%,shopify_order_name.ilike.%${search}%,pathao_consignment_id.ilike.%${search}%`
      );
    }

    const { startDateStr, endDateStr } = resolveDateRange(dateFilter, startDate, endDate);

    if (startDateStr && endDateStr) {
      query = query.gte("delivered_at", startDateStr).lte("delivered_at", endDateStr);
    }

    const { data: rawOrders, error } = await query;
    if (error) throw error;

    const orders = rawOrders || [];

    const headers = [
      "Order Number",
      "Customer Name",
      "Customer Phone",
      "Delivered Date (BST)",
      "Order Date (BST)",
      "Total Amount (BDT)",
      "Consignment ID",
      "Delivery Status",
      "Address",
    ];

    const rows = orders.map((o: any) => {
      const deliveredDate = o.delivered_at ? formatBstDate(o.delivered_at) : "N/A";
      const orderDate = o.shopify_created_at ? formatBstDate(o.shopify_created_at) : "N/A";
      const addrObj = o.shipping_address;
      const address =
        typeof addrObj === "object" && addrObj
          ? [addrObj.address1, addrObj.address2, addrObj.city, addrObj.zip].filter(Boolean).join(", ")
          : String(addrObj || "");
      const price = Number(o.original_total_price ?? o.total_price ?? 0);

      return [
        `"${o.shopify_order_name || ""}"`,
        `"${(o.customer_name || "").replace(/"/g, '""')}"`,
        `"${o.customer_phone || ""}"`,
        `"${deliveredDate}"`,
        `"${orderDate}"`,
        `"${price.toFixed(2)}"`,
        `"${o.pathao_consignment_id || ""}"`,
        `"${o.pathao_delivery_status || "Delivered"}"`,
        `"${String(address).replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const filename = `Universes_RAW_Deliveries_${dateFilter}_${formatBstDate(new Date())}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("GET /api/deliveries/export error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
