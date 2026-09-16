import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const sort = searchParams.get("sort") || "orders";

  const supabase = createServiceClient();
  let query = supabase.from("customers").select("*");

  if (search) {
    query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
  }

  if (sort === "orders") {
    query = query.order("total_orders", { ascending: false });
  } else if (sort === "spent") {
    query = query.order("total_spent", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data: customers, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!customers || customers.length === 0) {
    return NextResponse.json({ error: "No customers found to export" }, { status: 404 });
  }

  // Create CSV header
  const headers = [
    "Customer ID",
    "Shopify Customer ID",
    "Customer Name",
    "Email",
    "Phone",
    "Total Orders",
    "Total Spent",
    "Currency",
    "Email Opt-in",
    "SMS Opt-in",
    "WhatsApp Opt-in",
    "Marketing Tags",
    "Shopify Tags",
    "Shopify Created At",
    "Synced At",
    "Created At",
    "Updated At"
  ].join(",");

  // Create CSV rows
  const rows = customers.map((c: any) => {
    return [
      `"${c.id || ""}"`,
      `"${c.shopify_customer_id || ""}"`,
      `"${c.name?.replace(/"/g, '""') || ""}"`,
      `"${c.email || ""}"`,
      `"${c.phone || ""}"`,
      `"${c.total_orders || 0}"`,
      `"${c.total_spent || 0}"`,
      `"${c.currency || ""}"`,
      `"${c.email_opt_in ? 'Yes' : 'No'}"`,
      `"${c.sms_opt_in ? 'Yes' : 'No'}"`,
      `"${c.whatsapp_opt_in ? 'Yes' : 'No'}"`,
      `"${(c.marketing_tags || []).join(', ')}"`,
      `"${(c.shopify_tags || []).join(', ')}"`,
      `"${c.shopify_created_at ? new Date(c.shopify_created_at).toLocaleString() : ""}"`,
      `"${c.synced_at ? new Date(c.synced_at).toLocaleString() : ""}"`,
      `"${c.created_at ? new Date(c.created_at).toLocaleString() : ""}"`,
      `"${c.updated_at ? new Date(c.updated_at).toLocaleString() : ""}"`
    ].join(",");
  });

  const csv = [headers, ...rows].join("\n");

  const response = new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers_export_${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });

  return response;
}
