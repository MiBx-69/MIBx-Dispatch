import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { returnIds, status, is_paid_return } = body;

    if (!returnIds || !Array.isArray(returnIds) || returnIds.length === 0) {
      return NextResponse.json({ error: "returnIds is required (array)" }, { status: 400 });
    }
    if (!status && typeof is_paid_return !== "boolean") {
      return NextResponse.json({ error: "status or is_paid_return is required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const updatePayload: any = {};

    if (status === "mark_paid" || status === "mark_normal") {
      const isPaid = status === "mark_paid";
      updatePayload.is_paid_return = isPaid;
      if (isPaid) {
        updatePayload.return_delivery_fee = 0;
      }
    } else if (status) {
      updatePayload.status = status;
      // Set processed_at if transitioning to inspected/restocked/damaged
      if (["inspected", "restocked", "damaged"].includes(status)) {
        updatePayload.processed_at = new Date().toISOString();
      }
    }

    if (typeof is_paid_return === "boolean") {
      updatePayload.is_paid_return = is_paid_return;
      if (is_paid_return) {
        updatePayload.return_delivery_fee = 0;
      }
    }

    // Chunk returnIds in batches of 100 to avoid PostgREST query param size limits
    let processedTotal = 0;
    for (let i = 0; i < returnIds.length; i += 100) {
      const chunk = returnIds.slice(i, i + 100);
      const { data, error } = await supabase
        .from("returns")
        .update(updatePayload)
        .in("id", chunk)
        .select();

      if (error) throw error;
      processedTotal += (data?.length || 0);
    }

    return NextResponse.json({ success: true, processed: processedTotal });
  } catch (err: any) {
    console.error("PATCH /api/returns/bulk-status error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
