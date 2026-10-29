import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { applyLedgerFilters } from "@/lib/inventory-ledger";

export const dynamic = "force-dynamic";

const BATCH = 1000;
const MAX_ROWS = 50000;

/** Quote a CSV cell and neutralise spreadsheet formula injection. */
function cell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const filters = {
      search: sp.get("search") || undefined,
      type: sp.get("type") || "all",
      productId: sp.get("productId") || undefined,
      categoryId: sp.get("categoryId") || undefined,
      reason: sp.get("reason") || undefined,
      staffId: sp.get("staffId") || undefined,
      dateFilter: sp.get("dateFilter") || "all",
      startDate: sp.get("startDate") || undefined,
      endDate: sp.get("endDate") || undefined,
    };

    const supabase = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = [];
    for (let from = 0; from < MAX_ROWS; from += BATCH) {
      const { data, error } = await applyLedgerFilters(
        supabase.from("inventory_ledger_view").select("*"),
        filters
      )
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + BATCH - 1);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < BATCH) break;
    }

    const headers = [
      "Transaction ID", "Date & Time", "Product Name", "SKU", "Style Code", "Type", "Quantity",
      "Source Category", "Stock Out Reason", "Reference ID", "Staff Member", "Brought By",
      "Received By / Given To", "Unit Cost (BDT)", "Total Cost (BDT)", "Corrected", "Notes",
    ];

    const lines = rows.map((t) => {
      const d = t.transaction_date ? new Date(t.transaction_date) : null;
      const when = d
        ? d.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" }) + " " +
          d.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" })
        : "";
      return [
        t.transaction_number, when, t.product_name, t.sku, t.style_code, t.transaction_type, t.quantity,
        t.source_category_snapshot || t.category_name, t.stock_out_reason, t.reference_id, t.staff_name,
        t.brought_by, t.received_by,
        t.unit_cost !== null && t.unit_cost !== undefined ? Number(t.unit_cost).toFixed(2) : "",
        t.total_cost !== null && t.total_cost !== undefined ? Number(t.total_cost).toFixed(2) : "",
        t.correction_id ? "Yes: " + (t.correction_reason || "") : "",
        t.notes,
      ].map(cell).join(",");
    });

    // BOM so Excel opens UTF-8 (Bangla names) correctly; CSV opens natively in Excel
    const csv = "\uFEFF" + [headers.map(cell).join(","), ...lines].join("\r\n");
    const filename = `inventory-ledger-${filters.dateFilter}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("GET /api/inventory/export error:", err);
    return NextResponse.json({ error: err.message || "Failed to export CSV" }, { status: 500 });
  }
}
