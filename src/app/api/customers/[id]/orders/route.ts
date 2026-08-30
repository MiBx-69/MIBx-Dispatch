import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServiceClient();

    const { data: customer } = await supabase
      .from("customers")
      .select("shopify_customer_id, phone")
      .eq("id", id)
      .single();

    if (!customer) {
      return NextResponse.json({ orders: [] });
    }

    let query = supabase
      .from("orders")
      .select("*, dispatches(pathao_order_status, consignment_id)")
      .order("shopify_created_at", { ascending: false });

    if (customer.shopify_customer_id) {
      query = query.eq("customer_shopify_id", customer.shopify_customer_id);
    } else if (customer.phone) {
      query = query.eq("customer_phone", customer.phone);
    } else {
      return NextResponse.json({ orders: [] });
    }

    const { data: orders, error } = await query;

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
