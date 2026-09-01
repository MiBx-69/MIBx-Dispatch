import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "Missing start or end date" }, { status: 400 });
    }

    // Additional safeguard for Sept 1st minimum
    const minDateStr = "2026-08-31T18:00:00.000Z";
    const queryStart = startDate < minDateStr ? minDateStr : startDate;
    const queryEnd = endDate < minDateStr ? minDateStr : endDate;

    const supabase = createServiceClient();

    // Fetch all dispatches in the range
    const { data: dispatches, error } = await supabase
      .from("dispatches")
      .select(`
        dispatched_at,
        orders!inner(
          shopify_order_name,
          customer_name,
          customer_phone,
          shipping_address,
          line_items,
          pathao_consignment_id,
          internal_status
        )
      `)
      .gte("dispatched_at", queryStart)
      .lte("dispatched_at", queryEnd)
      .neq("orders.internal_status", "cancelled")
      .order("dispatched_at", { ascending: false });

    if (error) throw error;
    if (!dispatches || dispatches.length === 0) {
      return new NextResponse("No data found for this period", { status: 404 });
    }

    // Prepare CSV header
    const headers = [
      "Order Name",
      "Dispatch Date",
      "Customer Name",
      "Phone",
      "City",
      "Consignment ID",
      "Product Name",
      "Variant",
      "Quantity",
      "Price"
    ];

    // Build CSV rows
    // Since we want to export "dispatched products", we should flatten the line items.
    // So one row per product per order.
    const rows: string[] = [];

    const escape = (val: string | number | null | undefined) => {
      if (val == null) return "";
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    dispatches.forEach((d: any) => {
      const dispatchDate = d.dispatched_at ? new Date(d.dispatched_at).toLocaleString() : "";
      const o = d.orders;
      if (!o) return;

      const orderName = o.shopify_order_name || "";
      const custName = o.customer_name || "";
      const custPhone = o.customer_phone || "";
      const city = o.customer_address?.city || "";
      const consignment = o.pathao_consignment_id || "";

      const items = o.line_items as any[];
      if (Array.isArray(items)) {
        items.forEach(item => {
          rows.push([
            escape(orderName),
            escape(dispatchDate),
            escape(custName),
            escape(custPhone),
            escape(city),
            escape(consignment),
            escape(item.title || item.name || ""),
            escape(item.variant_title || ""),
            item.quantity || 1,
            item.price || 0
          ].join(","));
        });
      }
    });

    const csvContent = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="MiBx-Dispatched-Products-${queryStart.split("T")[0]}-to-${queryEnd.split("T")[0]}.csv"`,
      },
    });

  } catch (err: any) {
    console.error("Export Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
