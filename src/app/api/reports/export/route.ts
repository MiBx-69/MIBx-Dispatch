import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { formatBstDate } from "@/lib/reporting-engine";

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

    // Fetch all orders in the range
    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        id, 
        shopify_order_name, 
        shopify_created_at, 
        customer_name, 
        customer_phone, 
        shipping_address,
        total_price, 
        subtotal_price, 
        internal_status,
        fulfillment_status,
        fraud_status,
        line_items,
        pathao_consignment_id,
        returned_at,
        return_reason,
        return_delivery_fee,
        dispatches(pathao_order_status, dispatched_at, is_cancelled)
      `)
      .gte("shopify_created_at", queryStart)
      .lte("shopify_created_at", queryEnd)
      .order("shopify_created_at", { ascending: false });

    if (error) throw error;
    if (!orders || orders.length === 0) {
      return new NextResponse("No data found for this period", { status: 404 });
    }

    // Prepare CSV header
    const headers = [
      "Order Name",
      "Date",
      "Customer Name",
      "Phone",
      "City",
      "Gross Total",
      "Subtotal",
      "Delivery Fee",
      "Internal Status",
      "Fulfillment Status",
      "Fraud Status",
      "Consignment ID",
      "Courier Status",
      "Dispatch Date",
      "Items Count",
      "Products",
      "Returned At",
      "Return Reason",
      "Return Delivery Fee"
    ];

    // Build CSV rows
    const rows = orders.map((o: any) => {
      const date = o.shopify_created_at ? new Date(o.shopify_created_at).toLocaleString() : "";
      const city = o.shipping_address?.city || o.shipping_address?.province || "";
      const deliveryFee = Math.max(0, Math.round(Number(o.total_price || 0) - Number(o.subtotal_price || 0)));
      
      let itemsCount = 0;
      let productsList = "";
      
      const items = o.line_items as any[];
      if (Array.isArray(items)) {
        itemsCount = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
        productsList = items.map(i => `${i.quantity}x ${i.title || i.name}`).join(" | ");
      }
      
      let courierStatus = "";
      let dispatchDate = "";
      
      if (o.dispatches && Array.isArray(o.dispatches)) {
        const activeDispatch = o.dispatches.find((d: any) => !d.is_cancelled) || o.dispatches[0];
        if (activeDispatch) {
          courierStatus = activeDispatch.pathao_order_status || "";
          if (activeDispatch.dispatched_at) {
            dispatchDate = new Date(activeDispatch.dispatched_at).toLocaleString();
          }
        }
      }

      // Escape quotes and commas for CSV
      const escape = (val: string | number | null | undefined) => {
        if (val == null) return "";
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      return [
        escape(o.shopify_order_name),
        escape(date),
        escape(o.customer_name),
        escape(o.customer_phone),
        escape(city),
        o.total_price != null ? o.total_price : 0,
        o.subtotal_price != null ? o.subtotal_price : 0,
        deliveryFee,
        escape(o.internal_status),
        escape(o.fulfillment_status),
        escape(o.fraud_status),
        escape(o.pathao_consignment_id),
        escape(courierStatus),
        escape(dispatchDate),
        itemsCount,
        escape(productsList),
        o.returned_at ? escape(new Date(o.returned_at).toLocaleString()) : "",
        escape(o.return_reason),
        o.return_delivery_fee || 0
      ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="MiBx-Orders-${formatBstDate(startDate)}-to-${formatBstDate(endDate)}.csv"`,
      },
    });

  } catch (err: any) {
    console.error("Export Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
