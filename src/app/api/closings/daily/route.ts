import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { resolveDateRange, formatBstDate } from "@/lib/date-utils";
import { getComprehensiveBusinessReport } from "@/lib/business-metrics-engine";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateParam = searchParams.get("date") || formatBstDate(new Date());

    const supabase = createServiceClient();
    const { startDateStr, endDateStr } = resolveDateRange("custom", dateParam, dateParam);

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: "Invalid closing date" }, { status: 400 });
    }

    // Fetch cohort report for the day + activity-based events that happened on that day
    const [
      { report: cohortReport },
      { data: deliveredTodayOrders },
      { data: dispatchedTodayRows },
      { data: returnedTodayRows },
      { data: transactionsToday },
      { data: existingClosing },
      { data: recentClosings },
    ] = await Promise.all([
      getComprehensiveBusinessReport(startDateStr, endDateStr),
      supabase
        .from("orders")
        .select("id, shopify_order_name, customer_name, total_price, original_total_price, pathao_delivery_status, delivered_at")
        .eq("is_archived", false)
        .eq("internal_status", "delivered")
        .gte("delivered_at", startDateStr)
        .lte("delivered_at", endDateStr),
      supabase
        .from("dispatches")
        .select("id, order_id, shopify_order_name, consignment_id, amount_to_collect, delivery_fee, pathao_order_status, dispatched_at")
        .eq("is_cancelled", false)
        .gte("dispatched_at", startDateStr)
        .lte("dispatched_at", endDateStr),
      supabase
        .from("returns")
        .select("id, return_reference, order_id, return_type, return_reason, order_total, refund_amount, returned_product_value, return_delivery_fee, is_paid_return, is_verified, status, returned_at")
        .gte("returned_at", startDateStr)
        .lte("returned_at", endDateStr),
      supabase
        .from("transactions")
        .select("*")
        .gte("date", startDateStr)
        .lte("date", endDateStr)
        .order("date", { ascending: false }),
      supabase
        .from("daily_closings")
        .select("*")
        .eq("closing_date", dateParam)
        .maybeSingle(),
      supabase
        .from("daily_closings")
        .select("*")
        .order("closing_date", { ascending: false })
        .limit(30),
    ]);

    const delivList = deliveredTodayOrders || [];
    const dispList = dispatchedTodayRows || [];
    const retList = returnedTodayRows || [];
    const txList = transactionsToday || [];

    const deliveredTodayValue = delivList.reduce(
      (acc: number, o: any) => acc + Number(o.original_total_price ?? o.total_price ?? 0),
      0
    );
    const dispatchedTodayCod = dispList.reduce(
      (acc: number, d: any) => acc + Number(d.amount_to_collect || 0),
      0
    );
    const dispatchedTodayFees = dispList.reduce(
      (acc: number, d: any) => acc + Number(d.delivery_fee || 0),
      0
    );

    const fullReturnsToday = retList.filter((r: any) => r.return_type === "full");
    const partialReturnsToday = retList.filter((r: any) => r.return_type === "partial");
    const paidReturnsToday = retList.filter((r: any) => Boolean(r.is_paid_return));

    const returnedValueToday = retList.reduce(
      (acc: number, r: any) =>
        acc + Number(r.returned_product_value ?? r.refund_amount ?? r.order_total ?? 0),
      0
    );
    const returnFeesToday = retList.reduce(
      (acc: number, r: any) => acc + (r.is_paid_return ? 0 : Number(r.return_delivery_fee || 0)),
      0
    );

    const expensesToday = txList
      .filter((t: any) => t.type === "expense")
      .reduce((acc: number, t: any) => acc + Number(t.amount || 0), 0);

    const settlementsReceivedToday = txList
      .filter(
        (t: any) =>
          t.type === "income" &&
          ((t.category || "").toLowerCase().includes("pathao") ||
            (t.category || "").toLowerCase().includes("settlement"))
      )
      .reduce((acc: number, t: any) => acc + Number(t.amount || 0), 0);

    const otherIncomeToday = txList
      .filter(
        (t: any) =>
          t.type === "income" &&
          !(t.category || "").toLowerCase().includes("pathao") &&
          !(t.category || "").toLowerCase().includes("settlement")
      )
      .reduce((acc: number, t: any) => acc + Number(t.amount || 0), 0);

    const netSalesToday = Math.max(
      0,
      (deliveredTodayValue || cohortReport.salesPerformance.deliveredGrossSalesValue) -
        partialReturnsToday.reduce(
          (acc: number, r: any) => acc + Number(r.returned_product_value ?? r.refund_amount ?? 0),
          0
        )
    );

    const totalCourierFeesToday =
      (dispatchedTodayFees || cohortReport.courierPerformance.totalForwardDeliveryCharges) +
      returnFeesToday;

    const dailyOperatingResult =
      netSalesToday - totalCourierFeesToday - expensesToday + otherIncomeToday;

    const liveDailySummary = {
      closingDate: dateParam,
      ordersReceivedCount: cohortReport.orderPerformance.totalOrdersReceived,
      grossOrderValue: cohortReport.salesPerformance.grossOrderValue,
      ordersVerifiedCount: cohortReport.orderPerformance.verifiedOrdersCount,
      ordersDispatchedCount: dispList.length || cohortReport.orderPerformance.dispatchedOrdersCount,
      dispatchedCodValue: dispatchedTodayCod || cohortReport.salesPerformance.dispatchedOrderValue,
      ordersDeliveredCount: delivList.length || cohortReport.orderPerformance.deliveredOrdersCount,
      deliveredSalesValue:
        deliveredTodayValue || cohortReport.salesPerformance.deliveredGrossSalesValue,
      ordersReturnedCount: retList.length || cohortReport.returnPerformance.ordersWithAnyReturnCount,
      fullReturnsCount: fullReturnsToday.length,
      partialReturnsCount: partialReturnsToday.length,
      paidReturnsCount: paidReturnsToday.length,
      returnedProductValue:
        returnedValueToday || cohortReport.returnPerformance.totalReturnedProductValue,
      returnDeliveryFees: returnFeesToday,
      courierFeesToday: totalCourierFeesToday,
      settlementsReceivedToday,
      expensesRecordedToday: expensesToday,
      otherIncomeToday,
      netSalesToday,
      dailyOperatingResult,
      transactions: txList,
    };

    return NextResponse.json({
      closingDate: dateParam,
      liveDailySummary,
      cohortReport,
      existingClosing: existingClosing || null,
      recentClosings: recentClosings || [],
    });
  } catch (err: any) {
    console.error("GET /api/closings/daily error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authClient = await createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("user_id", user.id)
      .maybeSingle();

    const body = await request.json();
    const closing_date = body.closing_date || body.date;
    const status = body.status || body.closing_status || "approved"; // "draft" | "approved" | "locked"
    const { notes = "", metrics_snapshot } = body;

    if (!closing_date) {
      return NextResponse.json({ error: "closing_date is required" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("daily_closings")
      .select("*")
      .eq("closing_date", closing_date)
      .maybeSingle();

    if (existing?.status === "locked" && profile?.role !== "admin") {
      return NextResponse.json(
        { error: "This daily closing is locked. Only an Administrator can modify it." },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    const staffName = profile?.full_name || user.email || "Staff";
    const prevAudit = Array.isArray(existing?.audit_history) ? existing.audit_history : [];

    const payload: any = {
      closing_date,
      status,
      metrics_snapshot: metrics_snapshot || existing?.metrics_snapshot || {},
      notes: notes ?? existing?.notes ?? null,
      prepared_by: existing?.prepared_by || profile?.id || null,
      prepared_by_name: existing?.prepared_by_name || staffName,
      updated_at: now,
      audit_history: [
        ...prevAudit,
        {
          timestamp: now,
          action: `Daily Closing marked as ${status.toUpperCase()}`,
          by: staffName,
          notes,
        },
      ],
    };

    if (status === "approved" || status === "locked") {
      payload.approved_by = profile?.id || null;
      payload.approved_by_name = staffName;
      payload.approved_at = now;
    }

    const { data: saved, error } = await supabase
      .from("daily_closings")
      .upsert(payload, { onConflict: "closing_date" })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, closing: saved });
  } catch (err: any) {
    console.error("POST /api/closings/daily error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

