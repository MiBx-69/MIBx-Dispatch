import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
    .neq("orders.internal_status", "cancelled")
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

  if (status) {
    const mapped = STATUS_MAP[status] || [status];
    query = query.in("pathao_order_status", mapped);
  }

  // Date Filtering
  let startDateStr = "";
  let endDateStr = "";

  const now = new Date();
  
  if (dateFilter === "today") {
    startDateStr = new Date(now.setHours(0, 0, 0, 0)).toISOString();
    endDateStr = new Date(now.setHours(23, 59, 59, 999)).toISOString();
  } else if (dateFilter === "yesterday") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    startDateStr = new Date(yesterday.setHours(0, 0, 0, 0)).toISOString();
    endDateStr = new Date(yesterday.setHours(23, 59, 59, 999)).toISOString();
  } else if (dateFilter === "this_month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    startDateStr = new Date(firstDay.setHours(0, 0, 0, 0)).toISOString();
    endDateStr = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  } else if (dateFilter === "custom" && startDate && endDate) {
    startDateStr = new Date(startDate).toISOString();
    const end = new Date(endDate);
    endDateStr = new Date(end.setHours(23, 59, 59, 999)).toISOString();
  }

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
