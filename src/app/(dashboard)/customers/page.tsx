import { createServiceClient } from "@/lib/supabase/server";
import { Users, Phone, Mail, ShoppingBag } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Customers" };

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
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">Customers</h2>
          <p className="text-sm text-zinc-500">{count || 0} total customers</p>
        </div>
        <div className="text-xs text-zinc-600 bg-zinc-800 px-2.5 py-1 rounded-lg border border-zinc-700">
          📣 Marketing — Coming Soon
        </div>
      </div>

      {/* Search */}
      <form action="" method="GET">
        <input
          name="search"
          defaultValue={params.search}
          placeholder="Search customers..."
          className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm
                    text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
        />
      </form>

      {/* Customers grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(!customers || customers.length === 0) && (
          <div className="col-span-2 text-center py-16 text-zinc-600">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No customers yet. Sync Shopify orders first.</p>
          </div>
        )}
        {customers?.map((customer: any) => (
          <div key={customer.id}
            className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-all">
            {/* Avatar + Name */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-600/20 border border-indigo-500/30
                             flex items-center justify-center text-sm font-bold text-indigo-400 shrink-0">
                {customer.name?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-100 truncate">{customer.name}</p>
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="text-xs text-indigo-400 hover:underline flex items-center gap-1 mt-0.5">
                    <Phone size={10} /> {customer.phone}
                  </a>
                )}
                {customer.email && (
                  <p className="text-xs text-zinc-600 flex items-center gap-1 mt-0.5 truncate">
                    <Mail size={10} /> {customer.email}
                  </p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-800">
              <div>
                <p className="text-xs text-zinc-600">Orders</p>
                <p className="text-sm font-bold text-zinc-200 flex items-center gap-1">
                  <ShoppingBag size={12} className="text-indigo-400" />
                  {customer.total_orders || 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-600">Total Spent</p>
                <p className="text-sm font-bold text-emerald-400">
                  ৳{Number(customer.total_spent || 0).toLocaleString()}
                </p>
              </div>
              <div className="ml-auto">
                {/* Future: SMS/Email marketing tags */}
                {customer.sms_opt_in && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    SMS
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
