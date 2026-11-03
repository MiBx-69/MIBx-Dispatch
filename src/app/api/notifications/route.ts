import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications
 * Aggregates operational alerts across:
 * 1. High-risk fraud orders needing verification
 * 2. Unfulfilled orders pending > 48 hours
 * 3. Overdue customer CRM follow-up reminders
 * 4. Failed courier deliveries / returns
 */
export async function GET() {
  try {
    const supabase = createServiceClient();
    const nowIso = new Date().toISOString();
    const twoDaysAgoIso = new Date(Date.now() - 48 * 3600 * 1000).toISOString();

    const [
      highRiskRes,
      stalePendingRes,
      courierExceptionsRes,
      overdueFollowUpsRes,
    ] = await Promise.all([
      // 1. High-risk orders that are not cancelled or delivered
      supabase
        .from("orders")
        .select("id, shopify_order_name, customer_name, customer_phone, fraud_score, created_at, internal_status")
        .in("internal_status", ["pending", "preparing", "hold"])
        .gte("fraud_score", 60)
        .order("created_at", { ascending: false })
        .limit(10),

      // 2. Unfulfilled orders pending > 48 hours
      supabase
        .from("orders")
        .select("id, shopify_order_name, customer_name, customer_phone, created_at, internal_status")
        .eq("internal_status", "pending")
        .lt("created_at", twoDaysAgoIso)
        .is("pathao_consignment_id", null)
        .order("created_at", { ascending: true })
        .limit(10),

      // 3. Failed or Hold courier orders
      supabase
        .from("orders")
        .select("id, shopify_order_name, customer_name, pathao_consignment_id, pathao_delivery_status, updated_at")
        .or("pathao_delivery_status.ilike.%Failed%,pathao_delivery_status.ilike.%Hold%,pathao_delivery_status.ilike.%Return%")
        .not("internal_status", "in", '("delivered","cancelled")')
        .order("updated_at", { ascending: false })
        .limit(10),

      // 4. Overdue customer follow-up reminders
      supabase
        .from("customer_follow_ups" as any)
        .select("id, customer_id, title, reminder_date, priority, customers(name, phone)")
        .eq("status", "pending")
        .lte("reminder_date", nowIso)
        .order("reminder_date", { ascending: true })
        .limit(10)
        .then((res: any) => res, () => ({ data: [] })),
    ]);

    const notifications: Array<{
      id: string;
      category: "high_risk" | "stale_pending" | "courier_exception" | "follow_up";
      title: string;
      description: string;
      timestamp: string;
      actionUrl: string;
      severity: "critical" | "warning" | "info";
    }> = [];

    // Map High Risk
    (highRiskRes.data || []).forEach((ord: any) => {
      notifications.push({
        id: `risk-${ord.id}`,
        category: "high_risk",
        title: `High Risk: ${ord.shopify_order_name}`,
        description: `${ord.customer_name || "Customer"} (${ord.customer_phone || ""}) • Fraud Score: ${ord.fraud_score}/100`,
        timestamp: ord.created_at,
        actionUrl: `/orders?query=${encodeURIComponent(ord.shopify_order_name)}`,
        severity: "critical",
      });
    });

    // Map Stale Pending (>48h)
    (stalePendingRes.data || []).forEach((ord: any) => {
      notifications.push({
        id: `stale-${ord.id}`,
        category: "stale_pending",
        title: `Pending > 48h: ${ord.shopify_order_name}`,
        description: `Order pending dispatch since ${new Date(ord.created_at).toLocaleDateString()}`,
        timestamp: ord.created_at,
        actionUrl: `/orders?query=${encodeURIComponent(ord.shopify_order_name)}`,
        severity: "warning",
      });
    });

    // Map Courier Exceptions
    (courierExceptionsRes.data || []).forEach((ord: any) => {
      notifications.push({
        id: `courier-${ord.id}`,
        category: "courier_exception",
        title: `Courier Alert: ${ord.shopify_order_name}`,
        description: `${ord.pathao_delivery_status || "Exception"} • Consignment: ${ord.pathao_consignment_id || "N/A"}`,
        timestamp: ord.updated_at,
        actionUrl: `/dispatches?query=${encodeURIComponent(ord.shopify_order_name)}`,
        severity: "warning",
      });
    });

    // Map Overdue Follow-ups
    (overdueFollowUpsRes.data || []).forEach((f: any) => {
      notifications.push({
        id: `fu-${f.id}`,
        category: "follow_up",
        title: `Follow-up: ${f.title}`,
        description: `${(f.customers as any)?.name || "Customer"} • Due: ${new Date(f.reminder_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        timestamp: f.reminder_date,
        actionUrl: `/customers`,
        severity: f.priority === "urgent" || f.priority === "high" ? "critical" : "info",
      });
    });

    return NextResponse.json({
      totalCount: notifications.length,
      notifications,
    });
  } catch (err: any) {
    console.error("[Notifications API] Error:", err);
    return NextResponse.json({ totalCount: 0, notifications: [] }, { status: 500 });
  }
}
