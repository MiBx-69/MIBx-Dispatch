import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get("search") || "";
  const sort = searchParams.get("sort") || "orders";

  const supabase = createServiceClient();
  let query = supabase.from("customers").select("*");

  if (search) {
    query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
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
    "Customer Name",
    "Email",
    "Phone",
    "Total Orders",
    "Total Spent",
    "Created At"
  ].join(",");

  // Create CSV rows
  const rows = customers.map((c: any) => {
    return [
      `"${c.full_name?.replace(/"/g, '""') || ""}"`,
      `"${c.email || ""}"`,
      `"${c.phone || ""}"`,
      `"${c.total_orders || 0}"`,
      `"${c.total_spent || 0}"`,
      `"${new Date(c.created_at).toLocaleString()}"`
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
