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

    const minDateStr = "2026-08-31T18:00:00.000Z";
    const queryStart = startDate < minDateStr ? minDateStr : startDate;
    const queryEnd = endDate < minDateStr ? minDateStr : endDate;

    const supabase = createServiceClient();

    const { data: returns, error } = await supabase
      .from("returns")
      .select(`
        id,
        return_reason,
        return_type,
        return_source,
        order_total,
        return_delivery_fee,
        refund_amount,
        is_verified,
        status,
        notes,
        returned_at,
        processed_at,
        orders (
          shopify_order_name,
          customer_name,
          customer_phone,
          total_price,
          subtotal_price,
          pathao_consignment_id,
          shopify_created_at
        )
      `)
      .gte("returned_at", queryStart)
      .lte("returned_at", queryEnd)
      .order("returned_at", { ascending: false });

    if (error) throw error;
    if (!returns || returns.length === 0) {
      return new NextResponse("No returns found for this period", { status: 404 });
    }

    const headers = [
      "Order Name",
      "Customer Name",
      "Phone",
      "Order Total",
      "Refund Amount",
      "Verified",
      "Return Date",
      "Return Reason",
      "Return Type",
      "Return Source",
      "Return Delivery Fee",
      "Return Status",
      "Consignment ID",
      "Order Date",
      "Notes",
    ];

    const escape = (val: string | number | null | undefined) => {
      if (val == null) return "";
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = returns.map((r: any) => {
      const order = r.orders;
      return [
        escape(order?.shopify_order_name),
        escape(order?.customer_name),
        escape(order?.customer_phone),
        r.order_total || order?.total_price || 0,
        r.refund_amount || 0,
        r.is_verified ? "Yes" : "No",
        r.returned_at ? escape(new Date(r.returned_at).toLocaleString()) : "",
        escape(r.return_reason),
        escape(r.return_type),
        escape(r.return_source),
        r.return_delivery_fee || 0,
        escape(r.status),
        escape(order?.pathao_consignment_id),
        order?.shopify_created_at ? escape(new Date(order.shopify_created_at).toLocaleString()) : "",
        escape(r.notes),
      ].join(",");
    });

    const csvContent = [headers.join(","), ...rows].join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="MiBx-Returns-${startDate.split("T")[0]}-to-${endDate.split("T")[0]}.csv"`,
      },
    });
  } catch (err: any) {
    console.error("Export Returns Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
