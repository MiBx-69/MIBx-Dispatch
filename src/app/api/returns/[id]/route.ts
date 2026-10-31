import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { logOrderEvent } from "@/lib/audit";
import { syncReturnAndRefundToShopify } from "@/lib/shopify-returns";

// PATCH /api/returns/[id] — Update return record or retry Shopify synchronization
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      action,
      status,
      notes,
      return_reason,
      return_type,
      is_paid_return,
      return_delivery_fee,
      processed_at,
      is_verified,
      refund_amount,
      returned_product_value,
      returned_quantity,
      staff_responsible,
      edit_reason,
    } = body;

    const supabase = createServiceClient();

    const { data: existingReturn, error: fetchErr } = await supabase
      .from("returns")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !existingReturn) {
      return NextResponse.json({ error: "Return not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    // Handle Retry Shopify Synchronization
    if (action === "retry_sync") {
      const { data: order } = await supabase
        .from("orders")
        .select("id, shopify_order_id, shopify_order_name, line_items")
        .eq("id", existingReturn.order_id)
        .single();

      if (!order?.shopify_order_id) {
        return NextResponse.json(
          { error: "Associated order does not have a Shopify Order ID." },
          { status: 400 }
        );
      }

      const idempotencyKey =
        (existingReturn as any).idempotency_key || `mibx-retry-${existingReturn.id}`;
      const returnedItems = Array.isArray(existingReturn.returned_items)
        ? existingReturn.returned_items
        : [];
      const returnTypeNormalized: "partial" | "full" =
        existingReturn.return_type === "partial" ? "partial" : "full";

      const syncRes = await syncReturnAndRefundToShopify({
        shopifyOrderId: order.shopify_order_id,
        returnType: returnTypeNormalized,
        orderOverallReturnStatus: returnTypeNormalized,
        returnedItems: returnedItems as any,
        calculatedRefundAmount: Number(
          existingReturn.refund_amount ?? existingReturn.returned_product_value ?? 0
        ),
        returnReason: existingReturn.return_reason || "Customer refused",
        idempotencyKey,
      });

      const retryUpdate: any = {
        shopify_sync_status: syncRes.synced ? "synced" : "failed",
        shopify_sync_error: syncRes.error,
        idempotency_key: idempotencyKey,
        processed_at: now,
      };
      if (syncRes.shopifyReturnId) {
        retryUpdate.shopify_return_id = syncRes.shopifyReturnId;
      }
      if (syncRes.shopifyRefundId) {
        retryUpdate.shopify_refund_id = syncRes.shopifyRefundId;
      }
      if (syncRes.shopifyFinancialStatus) {
        retryUpdate.shopify_financial_status = syncRes.shopifyFinancialStatus;
      }
      if (syncRes.shopifyRefundedAmount != null) {
        retryUpdate.refund_amount = syncRes.shopifyRefundedAmount;
      }

      const prevAudit = Array.isArray((existingReturn as any).audit_history)
        ? (existingReturn as any).audit_history
        : [];
      const changesSnapshot = { ...retryUpdate };
      retryUpdate.audit_history = [
        ...prevAudit,
        {
          timestamp: now,
          action: syncRes.synced
            ? "Shopify Sync Retry Succeeded"
            : "Shopify Sync Retry Failed",
          changes: changesSnapshot,
        },
      ];

      const { data: updatedReturn, error: updErr } = await supabase
        .from("returns")
        .update(retryUpdate)
        .eq("id", id)
        .select("*")
        .single();

      if (updErr) throw updErr;

      if (syncRes.synced && syncRes.shopifyFinancialStatus) {
        await supabase
          .from("orders")
          .update({ financial_status: syncRes.shopifyFinancialStatus })
          .eq("id", existingReturn.order_id);
      }

      await logOrderEvent(
        existingReturn.order_id,
        syncRes.synced ? "SHOPIFY_RETURN_SYNCED" : "SHOPIFY_RETURN_SYNC_FAILED",
        syncRes.synced
          ? `Shopify synchronization succeeded on retry (Refund ID: ${syncRes.shopifyRefundId || "N/A"})`
          : `Shopify synchronization retry failed: ${syncRes.error}`,
        { returnId: id, ...changesSnapshot }
      ).catch(() => {});

      return NextResponse.json({
        success: syncRes.synced,
        synced: syncRes.synced,
        error: syncRes.error,
        data: updatedReturn,
      });
    }

    const updatePayload: any = {};

    if (status) updatePayload.status = status;
    if (notes !== undefined) updatePayload.notes = notes;
    if (return_reason !== undefined) updatePayload.return_reason = return_reason;
    if (return_type !== undefined) {
      updatePayload.return_type = return_type === "partial" ? "partial" : "full";
    }
    if (is_paid_return !== undefined) updatePayload.is_paid_return = Boolean(is_paid_return);
    if (return_delivery_fee !== undefined) {
      updatePayload.return_delivery_fee = Number(return_delivery_fee);
    }
    if (processed_at) updatePayload.processed_at = processed_at;
    if (staff_responsible !== undefined) updatePayload.staff_responsible = staff_responsible;
    if (returned_quantity !== undefined) {
      updatePayload.returned_quantity = Number(returned_quantity);
    }

    if (is_verified !== undefined) {
      updatePayload.is_verified = Boolean(is_verified);
      updatePayload.verification_status = is_verified ? "verified" : "unverified";
    }

    if (refund_amount !== undefined) {
      updatePayload.refund_amount = Number(refund_amount);
      if (
        returned_product_value === undefined &&
        Number(existingReturn.returned_product_value || 0) === 0
      ) {
        updatePayload.returned_product_value = Number(refund_amount);
      }
    }
    if (returned_product_value !== undefined) {
      updatePayload.returned_product_value = Number(returned_product_value);
    }

    // Append audit trail entry (capture shallow snapshot BEFORE adding audit_history to avoid circular JSON reference)
    const changesSnapshot = { ...updatePayload };
    const prevAudit = Array.isArray((existingReturn as any).audit_history)
      ? (existingReturn as any).audit_history
      : [];
    updatePayload.audit_history = [
      ...prevAudit,
      {
        timestamp: now,
        action: edit_reason || "Updated Return",
        previous: {
          status: existingReturn.status,
          return_type: existingReturn.return_type,
          return_reason: existingReturn.return_reason,
          refund_amount: existingReturn.refund_amount,
          returned_product_value: (existingReturn as any).returned_product_value,
          return_delivery_fee: existingReturn.return_delivery_fee,
          is_paid_return: existingReturn.is_paid_return,
        },
        changes: changesSnapshot,
      },
    ];

    const { data, error } = await supabase
      .from("returns")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (return_delivery_fee !== undefined && data?.order_id) {
      await supabase
        .from("orders")
        .update({ return_delivery_fee: Number(return_delivery_fee) })
        .eq("id", data.order_id);
    }

    if (data?.order_id) {
      await logOrderEvent(
        data.order_id,
        "RETURN_UPDATED",
        `Return ${data.return_reference || id.slice(0, 8)} updated`,
        { returnId: id, updates: changesSnapshot }
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    console.error("PATCH /api/returns/[id] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/returns/[id] — Undo a return
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: returnRecord, error: fetchErr } = await supabase
      .from("returns")
      .select("order_id, return_type, is_verified, refund_amount")
      .eq("id", id)
      .single();

    if (fetchErr || !returnRecord) {
      return NextResponse.json({ error: "Return not found" }, { status: 404 });
    }

    const { error: deleteErr } = await supabase
      .from("returns")
      .delete()
      .eq("id", id);

    if (deleteErr) throw deleteErr;

    // Check if any other returns still exist for this order
    const { data: remainingReturns } = await supabase
      .from("returns")
      .select("id, return_type")
      .eq("order_id", returnRecord.order_id);

    if (!remainingReturns || remainingReturns.length === 0) {
      const { data: dispatch } = await supabase
        .from("dispatches")
        .select("id")
        .eq("order_id", returnRecord.order_id)
        .eq("is_cancelled", false)
        .maybeSingle();

      const { data: order } = await supabase
        .from("orders")
        .select("pathao_consignment_id, original_total_price, total_price")
        .eq("id", returnRecord.order_id)
        .single();

      const oldStatus = dispatch || order?.pathao_consignment_id ? "delivered" : "pending";
      const origTotal = Number(order?.original_total_price ?? order?.total_price ?? 0);

      await supabase
        .from("orders")
        .update({
          internal_status: oldStatus,
          total_price: origTotal,
          returned_at: null,
          return_reason: null,
          return_delivery_fee: 0,
          pathao_delivery_status: oldStatus === "delivered" ? "Delivered" : null,
        })
        .eq("id", returnRecord.order_id);
    } else {
      await supabase
        .from("orders")
        .update({
          internal_status: "delivered",
          pathao_delivery_status: "Partial Return",
        })
        .eq("id", returnRecord.order_id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE /api/returns/[id] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
