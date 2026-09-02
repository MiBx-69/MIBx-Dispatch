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
      .select("shopify_customer_id, phone, email")
      .eq("id", id)
      .single();

    if (!customer) {
      return NextResponse.json({ orders: [] });
    }

    const orConditions = [`customer_id.eq.${id}`];
    if (customer.shopify_customer_id) orConditions.push(`customer_shopify_id.eq.${customer.shopify_customer_id}`);
    if (customer.phone) orConditions.push(`customer_phone.eq.${customer.phone}`);
    if (customer.email) orConditions.push(`customer_email.eq.${customer.email}`);

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*, dispatches(pathao_order_status, consignment_id)")
      .or(orConditions.join(","))
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
