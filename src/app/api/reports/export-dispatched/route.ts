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

    // Fetch all dispatches in the range (excluding cancelled and archived)
    const { data: dispatchesData, error } = await supabase
      .from("dispatches")
      .select(`
        dispatched_at,
        is_cancelled,
        pathao_order_status,
        orders!inner(
          shopify_order_name,
          customer_name,
          customer_phone,
          shipping_address,
          line_items,
          pathao_consignment_id,
          internal_status,
          is_archived
        )
      `)
      .gte("dispatched_at", queryStart)
      .lte("dispatched_at", queryEnd)
      .eq("is_cancelled", false)
      .neq("orders.internal_status", "cancelled")
      .eq("orders.is_archived", false)
      .order("dispatched_at", { ascending: false });

    if (error) throw error;
    const dispatches = (dispatchesData || []).filter((d: any) => {
      if (d.is_cancelled) return false;
      if (d.pathao_order_status && d.pathao_order_status.toLowerCase().includes("cancel")) return false;
      if (d.orders?.internal_status === "cancelled") return false;
      if (d.orders?.is_archived) return false;
      return true;
    });
    if (!dispatches || dispatches.length === 0) {
      return new NextResponse("No data found for this period", { status: 404 });
    }

    const escapeCsv = (val: string | number | null | undefined) => {
      if (val == null) return "";
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    // Prepare CSV header
    const headers = [
      "Dispatch Date",
      "Product Name",
      "Variant",
      "Total Dispatched Quantity"
    ];

    // Group by Date + Product + Variant
    const productMap = new Map<string, { date: string, name: string, variant: string, qty: number }>();

    dispatches.forEach((dispatch: any) => {
      const order = dispatch.orders;
      if (!order || !order.line_items) return;
      
      const dispatchDate = new Date(dispatch.dispatched_at).toLocaleDateString();
      const items = Array.isArray(order.line_items) ? order.line_items : [];
      
      items.forEach((item: any) => {
        const title = item.title || item.name || "Unknown";
        const variant = item.variant_title || "";
        const key = `${dispatchDate}-${title}-${variant}`;
        
        if (!productMap.has(key)) {
          productMap.set(key, {
            date: dispatchDate,
            name: title,
            variant: variant,
            qty: 0
          });
        }
        productMap.get(key)!.qty += item.quantity || 1;
      });
    });

    const rows: string[] = [];
    const groupedItems = Array.from(productMap.values());
    
    // Sort by Date (desc), then Quantity (desc)
    groupedItems.sort((a, b) => {
      if (a.date !== b.date) return new Date(b.date).getTime() - new Date(a.date).getTime();
      return b.qty - a.qty;
    });

    groupedItems.forEach((item) => {
      const row = [
        item.date,
        item.name,
        item.variant,
        item.qty.toString()
      ].map(escapeCsv).join(",");
      rows.push(row);
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
