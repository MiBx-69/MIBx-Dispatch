import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { returnIds, status } = body;

    if (!returnIds || !Array.isArray(returnIds) || returnIds.length === 0) {
      return NextResponse.json({ error: "returnIds is required (array)" }, { status: 400 });
    }
    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const updatePayload: any = { status };

    // Set processed_at if transitioning to inspected/restocked/damaged
    if (["inspected", "restocked", "damaged"].includes(status)) {
      updatePayload.processed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from("returns")
      .update(updatePayload)
      .in("id", returnIds)
      .select();

    if (error) throw error;

    return NextResponse.json({ success: true, processed: data.length });
  } catch (err: any) {
    console.error("PATCH /api/returns/bulk-status error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
