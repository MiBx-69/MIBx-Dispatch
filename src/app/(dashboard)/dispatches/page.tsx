import { createServiceClient } from "@/lib/supabase/server";
import { DispatchesClient } from "./dispatches-client";

export const metadata = { title: "Dispatches" };

export default async function DispatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const supabase = createServiceClient();
  const page = parseInt(params.page || "1");
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("dispatches")
    .select("*, orders(*)", { count: "exact" })
    .order("dispatched_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (params.status) {
    query = query.eq("pathao_order_status", params.status);
  }

  const { data: dispatches, count } = await query;
  
  const { data: settings } = await supabase.from("app_settings").select("pathao_store_id").single();

  return (
    <DispatchesClient
      dispatches={dispatches || []}
      count={count || 0}
      currentStatus={params.status}
      pathaoStoreId={settings?.pathao_store_id}
    />
  );
}
