import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { is_archived } = body;

    if (typeof is_archived !== "boolean") {
      return NextResponse.json(
        { error: "is_archived must be a boolean" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("orders")
      .update({ is_archived })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (is_archived) {
      await supabase
        .from("dispatches")
        .update({
          is_cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancel_reason: "Order removed/archived",
        })
        .eq("order_id", id);
    } else {
      if (data?.internal_status !== "cancelled") {
        await supabase
          .from("dispatches")
          .update({
            is_cancelled: false,
            cancelled_at: null,
            cancel_reason: null,
          })
          .eq("order_id", id);
      }
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Archive order error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update archive status" },
      { status: 500 }
    );
  }
}
