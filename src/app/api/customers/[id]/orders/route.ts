import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cleanId = decodeURIComponent(id).trim();
    const supabase = createServiceClient();

    const isUUID = UUID_REGEX.test(cleanId);
    let customerQuery = supabase
      .from("customers")
      .select("id, shopify_customer_id, phone, email");

    if (isUUID) {
      customerQuery = customerQuery.eq("id", cleanId);
    } else if (/^\d+$/.test(cleanId)) {
      customerQuery = customerQuery.eq("shopify_customer_id", Number(cleanId));
    } else {
      customerQuery = customerQuery.eq("phone", cleanId);
    }

    const { data: customer } = await customerQuery.maybeSingle();

    if (!customer) {
      return NextResponse.json({ orders: [] });
    }

    const orConditions = [`customer_id.eq.${customer.id}`];
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
