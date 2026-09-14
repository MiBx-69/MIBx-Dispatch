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

    // Fetch all 3 datasets in parallel for speed
    const [ordersResult, dispatchesResult, returnsResult] = await Promise.all([
      // 1. All Orders in range
      supabase
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
        .order("shopify_created_at", { ascending: false }),

      // 2. All Dispatches in range (non-cancelled and non-archived)
      supabase
        .from("dispatches")
        .select(`
          dispatched_at,
          amount_to_collect,
          is_cancelled,
          pathao_order_status,
          orders!inner(
            shopify_order_name,
            customer_name,
            customer_phone,
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
        .order("dispatched_at", { ascending: false }),

      // 3. All Returns in range
      supabase
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
        .order("returned_at", { ascending: false })
    ]);

    if (ordersResult.error) throw ordersResult.error;
    if (dispatchesResult.error) throw dispatchesResult.error;
    if (returnsResult.error) throw returnsResult.error;

    const orders = ordersResult.data || [];
    const dispatches = (dispatchesResult.data || []).filter((d: any) => {
      if (d.is_cancelled) return false;
      if (d.pathao_order_status && d.pathao_order_status.toLowerCase().includes("cancel")) return false;
      if (d.orders?.internal_status === "cancelled") return false;
      if (d.orders?.is_archived) return false;
      return true;
    });
    const returns = returnsResult.data || [];

    if (orders.length === 0 && dispatches.length === 0 && returns.length === 0) {
      return new NextResponse("No data found for this period", { status: 404 });
    }

    // Helper to safely escape CSV cells
    const escapeCsv = (val: string | number | null | undefined) => {
      if (val == null) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    // ----------------------------------------------------
    // SECTION 1: EXECUTIVE FINANCIAL & KPI SUMMARY
    // ----------------------------------------------------
    const totalOrders = orders.length;
    const deliveredOrders = orders.filter((o: any) => o.internal_status === "delivered");
    const deliveredCount = deliveredOrders.length;
    const returnedOrders = orders.filter((o: any) => o.internal_status === "returned");
    const returnedCount = returnedOrders.length;
    const cancelledOrders = orders.filter((o: any) => o.internal_status === "cancelled");
    const cancelledCount = cancelledOrders.length;
    const dispatchedCount = orders.filter((o: any) => o.internal_status === "dispatched").length;
    const pendingCount = orders.filter((o: any) => o.internal_status === "pending" || o.internal_status === "hold").length;

    const finalizedCount = deliveredCount + returnedCount;
    const successRate = finalizedCount > 0 ? `${((deliveredCount / finalizedCount) * 100).toFixed(1)}%` : "0.0%";
    const returnRate = finalizedCount > 0 ? `${((returnedCount / finalizedCount) * 100).toFixed(1)}%` : "0.0%";

    const totalGrossRevenue = orders.reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0);
    const deliveredRevenue = deliveredOrders.reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0);
    const returnedValue = Math.round(
      returns.reduce((sum: number, r: any) => {
        if (r.return_type === "partial") {
          if (Number(r.refund_amount) > 0) return sum + Number(r.refund_amount);
          if (Array.isArray(r.returned_items) && r.returned_items.length > 0) {
            const itemsSum = r.returned_items.reduce((s: number, i: any) => s + (Number(i.price || 0) * Number(i.quantity || 1)), 0);
            if (itemsSum > 0) return sum + itemsSum;
          }
        }
        return sum + (Number(r.order_total) || 0);
      }, 0)
    );
    const cancelledRevenue = cancelledOrders.reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0);
    const totalDeductions = returnedValue + cancelledRevenue;
    const netCollectibleRevenue = Math.max(0, totalGrossRevenue - totalDeductions);

    const totalDispatchedCollect = dispatches.reduce((sum: number, d: any) => sum + (Number(d.amount_to_collect) || 0), 0);
    const totalReturnDeliveryFees = returns.reduce((sum: number, r: any) => sum + (Number(r.return_delivery_fee) || 0), 0);

    const summarySection = [
      escapeCsv("=== SECTION 1: EXECUTIVE FINANCIAL & KPI SUMMARY ==="),
      ["Metric", "Value"].map(escapeCsv).join(","),
      ["Report Period Start", new Date(queryStart).toLocaleString()].map(escapeCsv).join(","),
      ["Report Period End", new Date(queryEnd).toLocaleString()].map(escapeCsv).join(","),
      ["Total Orders Created", totalOrders].map(escapeCsv).join(","),
      ["Delivered Orders", deliveredCount].map(escapeCsv).join(","),
      ["Dispatched Orders (In Transit)", dispatchedCount].map(escapeCsv).join(","),
      ["Returned Orders", returnedCount].map(escapeCsv).join(","),
      ["Cancelled Orders", cancelledCount].map(escapeCsv).join(","),
      ["Pending / Processing Orders", pendingCount].map(escapeCsv).join(","),
      ["Delivery Success Rate", successRate].map(escapeCsv).join(","),
      ["Return Rate", returnRate].map(escapeCsv).join(","),
      ["Gross Revenue (All Orders)", `BDT ${Math.round(totalGrossRevenue).toLocaleString()}`].map(escapeCsv).join(","),
      ["Delivered Revenue", `BDT ${Math.round(deliveredRevenue).toLocaleString()}`].map(escapeCsv).join(","),
      ["Dispatched Amount To Collect", `BDT ${Math.round(totalDispatchedCollect).toLocaleString()}`].map(escapeCsv).join(","),
      ["Deductions (Returns + Cancellations)", `-BDT ${Math.round(totalDeductions).toLocaleString()}`].map(escapeCsv).join(","),
      ["Net Collectible Revenue", `BDT ${Math.round(netCollectibleRevenue).toLocaleString()}`].map(escapeCsv).join(","),
      ["Total Return Delivery Fees Incurred", `BDT ${Math.round(totalReturnDeliveryFees).toLocaleString()}`].map(escapeCsv).join(","),
      "" // Empty line separator
    ];

    // ----------------------------------------------------
    // SECTION 2: COMPLETE ORDER MASTER DATA
    // ----------------------------------------------------
    const orderHeaders = [
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

    const orderRows = orders.map((o: any) => {
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

      return [
        escapeCsv(o.shopify_order_name),
        escapeCsv(date),
        escapeCsv(o.customer_name),
        escapeCsv(o.customer_phone),
        escapeCsv(city),
        o.total_price != null ? o.total_price : 0,
        o.subtotal_price != null ? o.subtotal_price : 0,
        deliveryFee,
        escapeCsv(o.internal_status),
        escapeCsv(o.fulfillment_status),
        escapeCsv(o.fraud_status),
        escapeCsv(o.pathao_consignment_id),
        escapeCsv(courierStatus),
        escapeCsv(dispatchDate),
        itemsCount,
        escapeCsv(productsList),
        o.returned_at ? escapeCsv(new Date(o.returned_at).toLocaleString()) : '""',
        escapeCsv(o.return_reason),
        o.return_delivery_fee || 0
      ].join(",");
    });

    const ordersSection = [
      escapeCsv(`=== SECTION 2: ALL ORDERS MASTER DATA (${orders.length} Records) ===`),
      orderHeaders.map(escapeCsv).join(","),
      ...orderRows,
      "" // Empty line separator
    ];

    // ----------------------------------------------------
    // SECTION 3: DISPATCHED PRODUCTS BREAKDOWN
    // ----------------------------------------------------
    const productHeaders = [
      "Dispatch Date",
      "Product Name",
      "Variant",
      "Total Dispatched Quantity"
    ];

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

    const groupedProducts = Array.from(productMap.values());
    groupedProducts.sort((a, b) => {
      if (a.date !== b.date) return new Date(b.date).getTime() - new Date(a.date).getTime();
      return b.qty - a.qty;
    });

    const productRows = groupedProducts.map((item) => [
      escapeCsv(item.date),
      escapeCsv(item.name),
      escapeCsv(item.variant),
      item.qty.toString()
    ].join(","));

    const productsSection = [
      escapeCsv(`=== SECTION 3: DISPATCHED PRODUCTS BREAKDOWN (${groupedProducts.length} Items) ===`),
      productHeaders.map(escapeCsv).join(","),
      ...(productRows.length > 0 ? productRows : [escapeCsv("No dispatched products in this period")]),
      "" // Empty line separator
    ];

    // ----------------------------------------------------
    // SECTION 4: RETURNS & REFUNDS AUDIT LOG
    // ----------------------------------------------------
    const returnHeaders = [
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
      "Notes"
    ];

    const returnRows = returns.map((r: any) => {
      const order = r.orders;
      return [
        escapeCsv(order?.shopify_order_name),
        escapeCsv(order?.customer_name),
        escapeCsv(order?.customer_phone),
        r.order_total || order?.total_price || 0,
        r.refund_amount || 0,
        r.is_verified ? '"Yes"' : '"No"',
        r.returned_at ? escapeCsv(new Date(r.returned_at).toLocaleString()) : '""',
        escapeCsv(r.return_reason),
        escapeCsv(r.return_type),
        escapeCsv(r.return_source),
        r.return_delivery_fee || 0,
        escapeCsv(r.status),
        escapeCsv(order?.pathao_consignment_id),
        order?.shopify_created_at ? escapeCsv(new Date(order.shopify_created_at).toLocaleString()) : '""',
        escapeCsv(r.notes)
      ].join(",");
    });

    const returnsSection = [
      escapeCsv(`=== SECTION 4: RETURNS & REFUNDS AUDIT LOG (${returns.length} Records) ===`),
      returnHeaders.map(escapeCsv).join(","),
      ...(returnRows.length > 0 ? returnRows : [escapeCsv("No returns recorded in this period")])
    ];

    // Combine all sections into a single master document
    // Include UTF-8 BOM (\uFEFF) so Excel on Windows displays all Bengali & special characters correctly
    const finalCsv = "\uFEFF" + [
      ...summarySection,
      ...ordersSection,
      ...productsSection,
      ...returnsSection
    ].join("\n");

    const fileStartDate = formatBstDate(startDate);
    const fileEndDate = formatBstDate(endDate);

    return new NextResponse(finalCsv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="MiBx-All-In-One-Report-${fileStartDate}-to-${fileEndDate}.csv"`,
      },
    });

  } catch (err: any) {
    console.error("Export All-in-One Report Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
