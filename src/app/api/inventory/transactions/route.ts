import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { fetchLedgerPage } from "@/lib/inventory-ledger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(sp.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(sp.get("pageSize") || "50", 10)));

    const { transactions, count } = await fetchLedgerPage(
      createServiceClient(),
      {
        search: sp.get("search") || undefined,
        type: sp.get("type") || "all",
        productId: sp.get("productId") || undefined,
        categoryId: sp.get("categoryId") || undefined,
        reason: sp.get("reason") || undefined,
        staffId: sp.get("staffId") || undefined,
        dateFilter: sp.get("dateFilter") || "all",
        startDate: sp.get("startDate") || undefined,
        endDate: sp.get("endDate") || undefined,
      },
      page,
      pageSize
    );

    return NextResponse.json({
      transactions,
      count,
      page,
      pageSize,
      totalPages: Math.ceil(count / pageSize),
    });
  } catch (err: any) {
    console.error("GET /api/inventory/transactions error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch transactions" }, { status: 500 });
  }
}
