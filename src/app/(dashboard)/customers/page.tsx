import { createServiceClient } from "@/lib/supabase/server";
import { CustomersClient } from "./customers-client";

export const metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();
  const page = parseInt(params.page || "1");
  const pageSize = 30;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("customers")
    .select("*", { count: "exact" })
    .order("total_orders", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (params.search) {
    query = query.or(
      `name.ilike.%${params.search}%,phone.ilike.%${params.search}%,email.ilike.%${params.search}%`
    );
  }

  const { data: customers, count } = await query;

  return (
    <CustomersClient
      initialCustomers={customers || []}
      total={count || 0}
      currentSearch={params.search}
    />
  );
}
