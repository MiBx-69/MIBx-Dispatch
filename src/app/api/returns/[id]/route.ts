import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// PATCH /api/returns/[id] — Update return status or details
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, notes, return_delivery_fee, processed_at, is_verified, refund_amount } = body;

    const supabase = createServiceClient();

    // Fetch the existing return record first to verify it's a partial return being verified
    const { data: existingReturn, error: fetchErr } = await supabase
      .from("returns")
      .select("id, order_id, return_type, is_verified, refund_amount, order_total")
      .eq("id", id)
      .single();

    if (fetchErr || !existingReturn) {
      return NextResponse.json({ error: "Return not found" }, { status: 404 });
    }

    const updatePayload: any = {};
    if (status) updatePayload.status = status;
    if (notes !== undefined) updatePayload.notes = notes;
    if (return_delivery_fee !== undefined) updatePayload.return_delivery_fee = Number(return_delivery_fee);
    if (processed_at) updatePayload.processed_at = processed_at;
    
    let isVerifyingPartial = false;
    if (is_verified !== undefined) {
      updatePayload.is_verified = is_verified;
      if (is_verified && !existingReturn.is_verified && existingReturn.return_type === "partial") {
        isVerifyingPartial = true;
      }
    }
    if (refund_amount !== undefined) updatePayload.refund_amount = Number(refund_amount);

    // If status is being set to inspected/restocked/damaged, set processed_at
    if (status && ["inspected", "restocked", "damaged"].includes(status) && !processed_at) {
      updatePayload.processed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("returns")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Also update the return_delivery_fee on the order if changed
    const orderUpdates: any = {};
    let shouldUpdateOrder = false;

    if (return_delivery_fee !== undefined && data?.order_id) {
      orderUpdates.return_delivery_fee = Number(return_delivery_fee);
      shouldUpdateOrder = true;
    }

    // If we just verified a partial return, deduct the refund amount from the order's total_price
    if (isVerifyingPartial && data?.order_id && updatePayload.refund_amount !== undefined) {
       // Fetch the current order to calculate new total
       const { data: orderData } = await supabase.from("orders").select("total_price").eq("id", data.order_id).single();
       if (orderData) {
         const currentTotal = Number(orderData.total_price) || 0;
         const newTotal = Math.max(0, currentTotal - Number(updatePayload.refund_amount));
         orderUpdates.total_price = newTotal;
         shouldUpdateOrder = true;
       }
    }

    if (shouldUpdateOrder && data?.order_id) {
      await supabase.from("orders").update(orderUpdates).eq("id", data.order_id);
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

    // Get the full return record to determine type and refund details
    const { data: returnRecord, error: fetchErr } = await supabase
      .from("returns")
      .select("order_id, return_type, is_verified, refund_amount")
      .eq("id", id)
      .single();

    if (fetchErr || !returnRecord) {
      return NextResponse.json({ error: "Return not found" }, { status: 404 });
    }

    const isPartial = returnRecord.return_type === "partial";

    // If this was a verified partial return, restore the deducted amount to the order's total_price
    if (isPartial && returnRecord.is_verified && returnRecord.refund_amount) {
      const { data: orderData } = await supabase
        .from("orders")
        .select("total_price")
        .eq("id", returnRecord.order_id)
        .single();

      if (orderData) {
        const restoredTotal = (Number(orderData.total_price) || 0) + Number(returnRecord.refund_amount);
        await supabase.from("orders").update({
          total_price: restoredTotal,
        }).eq("id", returnRecord.order_id);
      }
    }

    // Delete the return record
    const { error: deleteErr } = await supabase
      .from("returns")
      .delete()
      .eq("id", id);

    if (deleteErr) throw deleteErr;

    // Only reset order status for full returns (partials never changed the order status)
    if (!isPartial) {
      await supabase.from("orders").update({
        internal_status: "dispatched",
        returned_at: null,
        return_reason: null,
        return_delivery_fee: 0,
      }).eq("id", returnRecord.order_id);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("DELETE /api/returns/[id] error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
