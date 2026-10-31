import { createServiceClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { resolveDateRange, formatBstDate } from "@/lib/reporting-engine";

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
    Pending: ["Pending", "order.assigned_for_pickup", "order.pickup_cancelled"],
    "Picked Up": ["Picked Up", "order.pickup_collected"],
    "In Transit": ["In Transit", "order.in_transit", "order.at_delivery_hub"],
    "Out for Delivery": ["Out for Delivery", "order.out_for_delivery"],
    Delivered: ["Delivered", "Partial Delivered", "order.delivered", "order.partial_delivery", "order.payment_received"],
    Return: ["Return", "Returned", "order.return_in_transit"],
    "Paid Return": ["Paid Return", "paid_return"],
    "Return Completed": ["Return Completed", "order.returned"],
    Hold: ["Hold", "order.hold", "order.failed"],
    Cancelled: ["Cancelled", "order.cancelled"],
  };

  if (status === "Cancelled") {
    query = query.or(
      "is_cancelled.eq.true,pathao_order_status.in.(Cancelled,order.cancelled),orders.internal_status.eq.cancelled"
    );
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

  const { startDateStr, endDateStr } = resolveDateRange(
    dateFilter || undefined,
    startDate || undefined,
    endDate || undefined
  );

  if (startDateStr && endDateStr) {
    query = query.gte("dispatched_at", startDateStr).lte("dispatched_at", endDateStr);
  }

  const { data: rawDispatches, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const dispatches =
    rawDispatches?.sort((a: any, b: any) => {
      const numA = parseInt((a.orders?.shopify_order_name || "0").replace(/\D/g, ""), 10) || 0;
      const numB = parseInt((b.orders?.shopify_order_name || "0").replace(/\D/g, ""), 10) || 0;
      return numB - numA;
    }) || [];

  const headers = [
    "Order ID",
    "Consignment ID",
    "Customer Name",
    "Customer Phone",
    "Address",
    "City ID",
    "Zone ID",
    "Expected COD (BDT)",
    "Delivery Fee (BDT)",
    "Return Charge (BDT)",
    "Settlement Status",
    "Courier Status",
    "Dispatched Date (BST)",
  ];

  const escapeCSV = (field: any) => {
    if (field === null || field === undefined) return '""';
    const str = String(field);
    return `"${str.replace(/"/g, '""')}"`;
  };

  const rows = dispatches.map((d: any) => [
    escapeCSV(d.orders?.shopify_order_name || d.shopify_order_name),
    escapeCSV(d.consignment_id),
    escapeCSV(d.recipient_name || d.orders?.customer_name),
    escapeCSV(d.recipient_phone || d.orders?.customer_phone),
    escapeCSV(d.recipient_address),
    escapeCSV(d.recipient_city === 1 ? "Dhaka (1)" : d.recipient_city),
    escapeCSV(d.recipient_zone),
    escapeCSV(d.amount_to_collect ?? 0),
    escapeCSV(d.delivery_fee ?? 0),
    escapeCSV(d.return_charge ?? 0),
    escapeCSV(d.settlement_status || "pending"),
    escapeCSV(d.pathao_order_status),
    escapeCSV(d.dispatched_at ? formatBstDate(d.dispatched_at) : ""),
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="Universes_RAW_Dispatches_${formatBstDate(new Date())}.csv"`,
    },
  });
}
