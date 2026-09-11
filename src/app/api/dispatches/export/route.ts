import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveDateRange } from "@/lib/reporting-engine";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const dateFilter = searchParams.get("dateFilter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const supabase = createServiceClient();

  let query = supabase
    .from("dispatches")
    .select("*, orders!inner(*)")
    .order("dispatched_at", { ascending: false });

  const STATUS_MAP: Record<string, string[]> = {
    "Pending": ["Pending", "order.assigned_for_pickup", "order.pickup_cancelled"],
    "Picked Up": ["Picked Up", "order.pickup_collected"],
    "In Transit": ["In Transit", "order.in_transit", "order.at_delivery_hub"],
    "Out for Delivery": ["Out for Delivery", "order.out_for_delivery"],
    "Delivered": ["Delivered", "order.delivered", "order.partial_delivery", "order.payment_received"],
    "Return": ["Return", "order.return_in_transit"],
    "Return Completed": ["Return Completed", "order.returned"],
    "Hold": ["Hold", "order.hold", "order.failed"],
    "Cancelled": ["Cancelled", "order.cancelled"],
  };

  if (status === "Cancelled") {
    query = query.or("is_cancelled.eq.true,pathao_order_status.in.(Cancelled,order.cancelled),orders.internal_status.eq.cancelled");
  } else {
    query = query
      .eq("is_cancelled", false)
      .neq("orders.internal_status", "cancelled")
      .eq("orders.is_archived", false);

    if (status) {
      const mapped = STATUS_MAP[status] || [status];
      query = query.in("pathao_order_status", mapped);
    }
  }

  // Date Filtering
  const { startDateStr, endDateStr } = resolveDateRange(dateFilter || undefined, startDate || undefined, endDate || undefined);

  if (startDateStr && endDateStr) {
    query = query.gte("dispatched_at", startDateStr).lte("dispatched_at", endDateStr);
  }

  const { data: rawDispatches, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dispatches = rawDispatches?.sort((a: any, b: any) => {
    const numA = parseInt(a.orders.shopify_order_name.replace(/\D/g, ""));
    const numB = parseInt(b.orders.shopify_order_name.replace(/\D/g, ""));
    return numB - numA;
  }) || [];

  // Generate CSV
  const headers = [
    "Order ID",
    "Consignment ID",
    "Customer Name",
    "Customer Phone",
    "City",
    "Zone",
    "Amount to Collect",
    "Delivery Fee",
    "Status",
    "Dispatched At"
  ];

  const escapeCSV = (field: any) => {
    if (field === null || field === undefined) return '""';
    const str = String(field);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const rows = dispatches.map((d: any) => [
    escapeCSV(d.orders.shopify_order_name),
    escapeCSV(d.pathao_consignment_id),
    escapeCSV(d.orders.customer_name),
    escapeCSV(d.orders.customer_phone),
    escapeCSV(d.orders.customer_city),
    escapeCSV(d.orders.customer_zone),
    escapeCSV(d.amount_to_collect),
    escapeCSV(d.delivery_fee),
    escapeCSV(d.pathao_order_status),
    escapeCSV(d.dispatched_at ? new Date(d.dispatched_at).toLocaleString() : "")
  ]);

  const csvContent = [headers.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="dispatches_export_${new Date().toISOString().split('T')[0]}.csv"`
    }
  });
}
