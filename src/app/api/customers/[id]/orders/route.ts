import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*, dispatches(pathao_order_status, consignment_id)")
      .eq("customer_id", id)
      .order("shopify_created_at", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ orders: orders || [] });
  } catch (error: any) {
    console.error("Fetch customer orders error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch customer orders" },
      { status: 500 }
    );
  }
}
