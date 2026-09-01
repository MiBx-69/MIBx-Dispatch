import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    // 1. Fetch the dispatch to get the order_id
    const { data: dispatch, error: fetchError } = await supabase
      .from("dispatches")
      .select("order_id")
      .eq("id", id)
      .single();

    if (fetchError || !dispatch) {
      return NextResponse.json(
        { error: "Dispatch not found" },
        { status: 404 }
      );
    }

    // 2. Delete the dispatch record
    const { error: deleteError } = await supabase
      .from("dispatches")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: "Failed to delete dispatch" },
        { status: 500 }
      );
    }

    // 3. Update the associated order's status and archive it
    // Moving it to 'pending' allows it to be re-dispatched if restored.
    // Setting 'is_archived = true' moves it to the 'Removed' tab.
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        internal_status: "pending",
        is_archived: true,
      })
      .eq("id", dispatch.order_id);

    if (updateError) {
      return NextResponse.json(
        { error: "Failed to update associated order" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting dispatch:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
