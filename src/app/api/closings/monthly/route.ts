import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { getMonthRange, resolveDateRange } from "@/lib/date-utils";
import { getComprehensiveBusinessReport } from "@/lib/business-metrics-engine";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const nowBst = new Date(Date.now() + 6 * 3600 * 1000);
    const year = Number(searchParams.get("year")) || nowBst.getUTCFullYear();
    const month = Number(searchParams.get("month")) || nowBst.getUTCMonth() + 1;

    const periodKey = `${year}-${String(month).padStart(2, "0")}`;
    // getMonthRange uses 0-indexed month (0 = Jan, 11 = Dec)
    const { startDate: from, endDate: to } = getMonthRange(year, month - 1);
    const { startDateStr, endDateStr } = resolveDateRange("custom", from, to);

    if (!startDateStr || !endDateStr) {
      return NextResponse.json({ error: "Invalid month range" }, { status: 400 });
    }

    const supabase = createServiceClient();

    const [
      { report, previousReport, comparison, rawTransactions },
      { data: existingClosing },
      { data: historicalClosings },
    ] = await Promise.all([
      getComprehensiveBusinessReport(startDateStr, endDateStr, {
        includePreviousPeriod: true,
      }),
      supabase
        .from("monthly_closings")
        .select("*")
        .eq("period_key", periodKey)
        .maybeSingle(),
      supabase
        .from("monthly_closings")
        .select("*")
        .order("period_key", { ascending: false })
        .limit(24),
    ]);

    // Pre-closing validation checklist
    const pendingOrdersCount =
      report.orderPerformance.pendingOrdersCount +
      report.orderPerformance.preparingOrdersCount +
      report.orderPerformance.holdOrdersCount;
    const inTransitCount = report.orderPerformance.inTransitOrdersCount;
    const unresolvedReturnsCount =
      report.returnPerformance.unverifiedReturnsCount +
      report.returnPerformance.inTransitReturnsCount;
    const unsettledParcelsCount = report.courierPerformance.unsettledParcelsCount;
    const outstandingCourierBalance = report.courierPerformance.outstandingCourierBalance;
    const expenseCount = rawTransactions.filter((t) => t.type === "expense").length;

    const checklist = [
      {
        id: "orders_finalized",
        label: "All dispatched orders have final delivery or return status",
        passed: inTransitCount === 0 && pendingOrdersCount === 0,
        warningCount: inTransitCount + pendingOrdersCount,
        detail:
          inTransitCount + pendingOrdersCount === 0
            ? "All orders in period are finalized."
            : `${inTransitCount} in-transit and ${pendingOrdersCount} pending/hold orders remain.`,
      },
      {
        id: "returns_verified",
        label: "All full, partial, and paid returns are verified",
        passed: unresolvedReturnsCount === 0,
        warningCount: unresolvedReturnsCount,
        detail:
          unresolvedReturnsCount === 0
            ? "All return records are verified."
            : `${unresolvedReturnsCount} return(s) are pending verification or in transit.`,
      },
      {
        id: "courier_settled",
        label: "Pathao COD & courier charges are reconciled",
        passed: unsettledParcelsCount === 0 || outstandingCourierBalance === 0,
        warningCount: unsettledParcelsCount,
        detail:
          outstandingCourierBalance === 0
            ? "All courier COD receivables are reconciled."
            : `BDT ${outstandingCourierBalance.toLocaleString()} COD balance across ${unsettledParcelsCount} parcel(s) is still pending settlement.`,
      },
      {
        id: "expenses_recorded",
        label: "Operating expenses for the month are recorded",
        passed: expenseCount > 0,
        warningCount: expenseCount === 0 ? 1 : 0,
        detail:
          expenseCount > 0
            ? `${expenseCount} expense transaction(s) recorded (BDT ${report.financialPerformance.totalAllRecordedExpenses.toLocaleString()}).`
            : "No operating expenses recorded for this month yet.",
      },
    ];

    const validationSummary = {
      allPassed: checklist.every((c) => c.passed),
      pendingOrdersCount,
      inTransitCount,
      unresolvedReturnsCount,
      unsettledParcelsCount,
      outstandingCourierBalance,
      expenseCount,
      checklist,
    };

    return NextResponse.json({
      year,
      month,
      periodKey,
      report,
      previousReport,
      comparison,
      validationSummary,
      existingClosing: existingClosing || null,
      historicalClosings: historicalClosings || [],
    });
  } catch (err: any) {
    console.error("GET /api/closings/monthly error:", err);
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
    const {
      action = "approve_and_lock", // "save_snapshot" | "approve_and_lock" | "reopen"
      year,
      month,
      notes = "",
      reopen_reason = "",
      validation_summary = {},
      statement_snapshot = {},
    } = body;

    if (!year || !month) {
      return NextResponse.json({ error: "year and month are required" }, { status: 400 });
    }

    const periodKey = `${year}-${String(month).padStart(2, "0")}`;
    const staffName = profile?.full_name || user.email || "Admin";
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("monthly_closings")
      .select("*")
      .eq("period_key", periodKey)
      .maybeSingle();

    const prevAudit = Array.isArray(existing?.audit_history) ? existing.audit_history : [];

    if (action === "reopen") {
      if (profile?.role !== "admin") {
        return NextResponse.json(
          { error: "Only an Administrator can reopen a locked month-end closing." },
          { status: 403 }
        );
      }
      if (!reopen_reason || String(reopen_reason).trim().length < 3) {
        return NextResponse.json(
          { error: "A mandatory reason is required to reopen a locked period." },
          { status: 400 }
        );
      }

      const { data: reopened, error: reopenErr } = await supabase
        .from("monthly_closings")
        .update({
          status: "reopened",
          reopened_by: profile?.id || null,
          reopened_by_name: staffName,
          reopened_at: now,
          reopen_reason: String(reopen_reason).trim(),
          updated_at: now,
          audit_history: [
            ...prevAudit,
            {
              timestamp: now,
              action: "REOPENED_MONTH_CLOSING",
              by: staffName,
              reason: String(reopen_reason).trim(),
            },
          ],
        })
        .eq("period_key", periodKey)
        .select()
        .single();

      if (reopenErr) throw reopenErr;
      return NextResponse.json({ success: true, closing: reopened });
    }

    if (existing?.status === "locked" && action !== "reopen") {
      return NextResponse.json(
        { error: "This month is locked. Reopen the period with a reason before modifying it." },
        { status: 400 }
      );
    }

    const targetStatus =
      body.closing_status || (action === "approve_and_lock" ? "locked" : "approved");

    const payload: any = {
      year: Number(year),
      month: Number(month),
      period_key: periodKey,
      status: targetStatus,
      validation_summary: validation_summary || existing?.validation_summary || {},
      statement_snapshot: statement_snapshot || existing?.statement_snapshot || {},
      notes: notes || existing?.notes || null,
      approved_by: profile?.id || null,
      approved_by_name: staffName,
      approved_at: now,
      locked_at: targetStatus === "locked" ? now : existing?.locked_at || null,
      updated_at: now,
      audit_history: [
        ...prevAudit,
        {
          timestamp: now,
          action: targetStatus === "locked" ? "APPROVED_AND_LOCKED_MONTH" : "SAVED_MONTHLY_SNAPSHOT",
          by: staffName,
          notes,
        },
      ],
    };

    const { data: saved, error: saveErr } = await supabase
      .from("monthly_closings")
      .upsert(payload, { onConflict: "period_key" })
      .select()
      .single();

    if (saveErr) throw saveErr;

    return NextResponse.json({ success: true, closing: saved });
  } catch (err: any) {
    console.error("POST /api/closings/monthly error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

