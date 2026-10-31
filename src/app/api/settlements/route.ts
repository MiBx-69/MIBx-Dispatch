import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { resolveDateRange, formatBstDate } from "@/lib/date-utils";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const dateFilter = searchParams.get("dateFilter") || "this_month";
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const statusFilter = searchParams.get("status") || "all";
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    const supabase = createServiceClient();
    const { startDateStr, endDateStr } = resolveDateRange(dateFilter, startDate, endDate);

    let dispatchesQuery = supabase
      .from("dispatches")
      .select(`
        *,
        orders!inner (
          id,
          shopify_order_name,
          customer_name,
          customer_phone,
          total_price,
          original_total_price,
          internal_status,
          is_archived
        )
      `)
      .eq("is_cancelled", false)
      .eq("orders.is_archived", false)
      .order("dispatched_at", { ascending: false });

    if (startDateStr && endDateStr) {
      dispatchesQuery = dispatchesQuery
        .gte("dispatched_at", startDateStr)
        .lte("dispatched_at", endDateStr);
    }

    const [{ data: rawDispatches, error: dispErr }, { data: batches }, { data: partialReturns }] =
      await Promise.all([
        dispatchesQuery,
        supabase
          .from("courier_settlement_batches")
          .select("*")
          .order("settlement_date", { ascending: false })
          .limit(50),
        supabase
          .from("returns")
          .select("order_id, refund_amount, returned_product_value, return_delivery_fee, is_verified, return_type")
          .eq("is_verified", true),
      ]);

    if (dispErr) throw dispErr;

    const partialByOrder = new Map<string, number>();
    const returnFeeByOrder = new Map<string, number>();
    for (const r of partialReturns || []) {
      if (r.return_type === "partial") {
        const val = Number(r.returned_product_value || r.refund_amount || 0);
        partialByOrder.set(r.order_id, (partialByOrder.get(r.order_id) || 0) + val);
      }
      if (Number(r.return_delivery_fee) > 0) {
        returnFeeByOrder.set(r.order_id, Number(r.return_delivery_fee));
      }
    }

    let parcels = (rawDispatches || []).map((d: any) => {
      const pStatus = (d.pathao_order_status || "Pending").toLowerCase();
      const isDelivered = pStatus === "delivered" || pStatus.includes("partial");
      const isPaidReturn = pStatus === "paid return" || pStatus === "paid_return";
      const isReturned =
        !isPaidReturn &&
        (pStatus.includes("return") || pStatus.includes("delivery_failed") || pStatus.includes("delivery failed"));

      const partialDed = partialByOrder.get(d.order_id) || 0;
      const rawExpected = Number(d.expected_cod ?? d.amount_to_collect ?? d.orders?.original_total_price ?? d.orders?.total_price ?? 0);
      const expectedCod = Math.max(0, rawExpected - partialDed);

      const defaultFee = d.recipient_city === 1 ? 60 : 120;
      const deliveryFee = Number(d.delivery_fee || defaultFee);
      const returnCharge = isReturned
        ? Number(d.return_charge || returnFeeByOrder.get(d.order_id) || deliveryFee)
        : Number(d.return_charge || 0);
      const otherDeductions = Number(d.other_deductions || 0);

      const collectedCod = isDelivered
        ? Number(d.actual_cod_collected || 0) > 0
          ? Math.max(0, Number(d.actual_cod_collected) - partialDed)
          : expectedCod
        : isPaidReturn
          ? Number(d.actual_cod_collected || deliveryFee)
          : 0;

      const totalCharges = (isDelivered || isPaidReturn ? deliveryFee : 0) + returnCharge + otherDeductions;
      const netPayable = Math.max(0, collectedCod - totalCharges);
      const actualReceived = Number(d.actual_received_amount || 0);
      const discrepancy = Number((netPayable - actualReceived).toFixed(2));
      const settlementStatus = d.settlement_status || "pending";

      return {
        id: d.id,
        order_id: d.order_id,
        order_name: d.orders?.shopify_order_name || d.shopify_order_name,
        consignment_id: d.consignment_id,
        customer_name: d.recipient_name || d.orders?.customer_name,
        customer_phone: d.recipient_phone || d.orders?.customer_phone,
        city_id: d.recipient_city,
        pathao_status: d.pathao_order_status,
        dispatched_at: d.dispatched_at,
        expected_cod: expectedCod,
        partial_return_deduction: partialDed,
        actual_cod_collected: collectedCod,
        delivery_fee: isDelivered || isPaidReturn ? deliveryFee : 0,
        return_charge: returnCharge,
        other_deductions: otherDeductions,
        total_charges: totalCharges,
        net_payable: netPayable,
        actual_received_amount: actualReceived,
        discrepancy,
        settlement_status: settlementStatus,
        settlement_date: d.settlement_date,
        payment_reference: d.payment_reference,
        settlement_notes: d.settlement_notes,
        is_finalized: isDelivered || isPaidReturn || isReturned,
      };
    });

    if (statusFilter !== "all") {
      parcels = parcels.filter((p) => p.settlement_status === statusFilter);
    }

    if (search) {
      parcels = parcels.filter(
        (p) =>
          (p.order_name && p.order_name.toLowerCase().includes(search)) ||
          (p.consignment_id && p.consignment_id.toLowerCase().includes(search)) ||
          (p.customer_name && p.customer_name.toLowerCase().includes(search)) ||
          (p.customer_phone && p.customer_phone.toLowerCase().includes(search)) ||
          (p.payment_reference && p.payment_reference.toLowerCase().includes(search))
      );
    }

    const summary = parcels.reduce(
      (acc, p) => {
        acc.totalExpectedCod += p.expected_cod;
        acc.totalCollectedCod += p.actual_cod_collected;
        acc.totalDeliveryFees += p.delivery_fee;
        acc.totalReturnFees += p.return_charge;
        acc.totalOtherDeductions += p.other_deductions;
        acc.totalCourierCharges += p.total_charges;
        acc.netExpectedPayable += p.net_payable;
        acc.totalReceived += p.actual_received_amount;
        if (p.settlement_status === "settled") acc.settledCount++;
        else if (p.settlement_status === "partially_settled") acc.partiallySettledCount++;
        else if (p.settlement_status === "disputed") acc.disputedCount++;
        else if (p.is_finalized) acc.unsettledCount++;
        return acc;
      },
      {
        totalExpectedCod: 0,
        totalCollectedCod: 0,
        totalDeliveryFees: 0,
        totalReturnFees: 0,
        totalOtherDeductions: 0,
        totalCourierCharges: 0,
        netExpectedPayable: 0,
        totalReceived: 0,
        outstandingBalance: 0,
        settledCount: 0,
        partiallySettledCount: 0,
        unsettledCount: 0,
        disputedCount: 0,
      }
    );
    summary.outstandingBalance = Math.max(0, summary.netExpectedPayable - summary.totalReceived);

    return NextResponse.json({
      parcels,
      batches: batches || [],
      summary,
      period: { startDateStr, endDateStr },
    });
  } catch (err: any) {
    console.error("GET /api/settlements error:", err);
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
    const body = await request.json();
    const { action } = body;

    // 1. Update single parcel settlement details
    if (action === "update_parcel") {
      const {
        dispatch_id,
        actual_cod_collected,
        delivery_fee,
        return_charge,
        other_deductions,
        actual_received_amount,
        settlement_status,
        payment_reference,
        settlement_notes,
        settlement_date,
      } = body;

      if (!dispatch_id) {
        return NextResponse.json({ error: "dispatch_id is required" }, { status: 400 });
      }

      const collected = Number(actual_cod_collected || 0);
      const delFee = Number(delivery_fee || 0);
      const retFee = Number(return_charge || 0);
      const otherDed = Number(other_deductions || 0);
      const netSettlement = Math.max(0, collected - delFee - retFee - otherDed);
      const received = Number(actual_received_amount ?? netSettlement);

      const { data: updated, error } = await supabase
        .from("dispatches")
        .update({
          actual_cod_collected: collected,
          delivery_fee: delFee,
          return_charge: retFee,
          other_deductions: otherDed,
          settlement_amount: netSettlement,
          actual_received_amount: received,
          settlement_status: settlement_status || (received >= netSettlement && netSettlement > 0 ? "settled" : "partially_settled"),
          payment_reference: payment_reference || null,
          settlement_notes: settlement_notes || null,
          settlement_date: settlement_date || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", dispatch_id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, dispatch: updated });
    }

    // 2. Record a Pathao Settlement Batch (and mark selected parcels settled)
    if (action === "create_batch") {
      const {
        batch_reference,
        settlement_date,
        dispatch_ids = [],
        total_expected_cod = 0,
        total_collected_cod = 0,
        total_delivery_charges = 0,
        total_return_charges = 0,
        total_other_deductions = 0,
        actual_received_amount = 0,
        payment_method = "Bank Transfer",
        payment_reference = "",
        notes = "",
        record_in_transactions = true,
      } = body;

      const ref =
        (batch_reference || "").trim() ||
        `SET-${formatBstDate(new Date()).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

      const netSettlement = Math.max(
        0,
        Number(total_collected_cod) -
          Number(total_delivery_charges) -
          Number(total_return_charges) -
          Number(total_other_deductions)
      );
      const receivedAmt = Number(actual_received_amount || netSettlement);
      const discrepancy = Number((netSettlement - receivedAmt).toFixed(2));

      const { data: batch, error: batchErr } = await supabase
        .from("courier_settlement_batches")
        .insert({
          batch_reference: ref,
          courier: "pathao",
          settlement_date: settlement_date || formatBstDate(new Date()),
          total_expected_cod: Number(total_expected_cod),
          total_collected_cod: Number(total_collected_cod),
          total_delivery_charges: Number(total_delivery_charges),
          total_return_charges: Number(total_return_charges),
          total_other_deductions: Number(total_other_deductions),
          net_settlement_amount: netSettlement,
          actual_received_amount: receivedAmt,
          discrepancy_amount: discrepancy,
          payment_method,
          payment_reference: payment_reference || ref,
          notes,
          parcel_count: Array.isArray(dispatch_ids) ? dispatch_ids.length : 0,
        })
        .select()
        .single();

      if (batchErr) throw batchErr;

      // Update linked dispatches if provided
      if (Array.isArray(dispatch_ids) && dispatch_ids.length > 0) {
        const { data: rows } = await supabase
          .from("dispatches")
          .select("id, amount_to_collect, actual_cod_collected, delivery_fee, return_charge, other_deductions, recipient_city")
          .in("id", dispatch_ids);

        for (const r of rows || []) {
          const col = Number(r.actual_cod_collected || r.amount_to_collect || 0);
          const fee = Number(r.delivery_fee || (r.recipient_city === 1 ? 60 : 120));
          const ret = Number(r.return_charge || 0);
          const oth = Number(r.other_deductions || 0);
          const net = Math.max(0, col - fee - ret - oth);
          await supabase
            .from("dispatches")
            .update({
              actual_cod_collected: col,
              settlement_amount: net,
              actual_received_amount: net,
              settlement_status: "settled",
              settlement_batch_id: batch.id,
              settlement_date: new Date().toISOString(),
              payment_reference: payment_reference || ref,
              updated_at: new Date().toISOString(),
            })
            .eq("id", r.id);
        }
      }

      // Optionally record in transactions ledger with idempotency key so it cannot be duplicated
      if (record_in_transactions && receivedAmt > 0) {
        await supabase.from("transactions").upsert(
          {
            type: "income",
            amount: receivedAmt,
            category: "Pathao COD Settlement",
            description: `Pathao Settlement Batch ${ref}${payment_reference ? ` (Ref: ${payment_reference})` : ""}`,
            payment_method,
            reference_id: ref,
            idempotency_key: `settlement_batch_${ref}`,
            date: settlement_date ? new Date(settlement_date).toISOString() : new Date().toISOString(),
            created_by: user.id,
          },
          { onConflict: "idempotency_key" }
        );
      }

      return NextResponse.json({ success: true, batch });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    console.error("POST /api/settlements error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

