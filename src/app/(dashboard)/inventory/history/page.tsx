import { Metadata } from "next";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { fetchLedgerPage } from "@/lib/inventory-ledger";
import { StockHistoryClient } from "@/components/inventory/stock-history-client";
import type { InventorySourceCategory } from "@/types/inventory";

export const metadata: Metadata = {
  title: "Stock Ledger & History — MiBx Dispatch",
  description: "Complete chronological history and audit trail of all inventory transactions",
};

export const dynamic = "force-dynamic";

export default async function StockHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    type?: string;
    categoryId?: string;
    reason?: string;
    staffId?: string;
    productId?: string;
    dateFilter?: string;
    startDate?: string;
    endDate?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const pageSize = 50;

  const search = params.search?.trim() || "";
  const type = params.type || "all";
  const categoryId = params.categoryId || "";
  const reason = params.reason || "";
  const staffId = params.staffId || "";
  const productId = params.productId || "";
  const dateFilter = params.dateFilter || "all";

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const supabase = createServiceClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user?.id || "")
    .single();

  const ledgerPromise = fetchLedgerPage(
    supabase,
    {
      search,
      type,
      productId,
      categoryId,
      reason,
      staffId,
      dateFilter,
      startDate: params.startDate,
      endDate: params.endDate,
    },
    page,
    pageSize
  );

  const [
    ledger,
    { data: categories },
    { data: staffMembers },
    { data: productsList },
  ] = await Promise.all([
    ledgerPromise,
    supabase.from("inventory_source_categories").select("id, name").order("name", { ascending: true }),
    supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true }),
    supabase.from("inventory_products").select("id, product_name").eq("status", "active").order("product_name", { ascending: true }),
  ]);

  const reasons = [
    "Online Order",
    "Showroom Sale",
    "Stock Transfer",
    "Damaged Product",
    "Missing Stock",
    "Sample / Photography",
    "Other",
  ];

  return (
    <StockHistoryClient
      transactions={ledger.transactions}
      totalCount={ledger.count}
      categories={(categories || []) as unknown as InventorySourceCategory[]}
      staffMembers={staffMembers || []}
      productsList={productsList || []}
      reasons={reasons}
      currentPage={page}
      pageSize={pageSize}
      currentSearch={search}
      currentType={type}
      currentCategoryId={categoryId}
      currentReason={reason}
      currentStaffId={staffId}
      currentProductId={productId}
      currentDateFilter={dateFilter}
      currentStartDate={params.startDate}
      currentEndDate={params.endDate}
      userRole={profile?.role || "staff"}
    />
  );
}

