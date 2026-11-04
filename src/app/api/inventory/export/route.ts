import { NextRequest } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { applyLedgerFilters, type LedgerFilters } from "@/lib/inventory-ledger";

export const dynamic = "force-dynamic";

/** Escape fields for CSV according to RFC 4180. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return '""';
  const s = String(v).replace(/"/g, '""');
  return `"${s}"`;
}

// GET /api/inventory/export — Download stock ledger as CSV with separate In/Out columns
export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const filters: LedgerFilters = {
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
    const MAX_ROWS = 10000;
    const BATCH = 1000;
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
      "Transaction ID",
      "Date & Time",
      "Product Name",
      "SKU",
      "Style Code",
      "Movement Type",
      "Incoming Qty (+)",
      "Outgoing Qty (-)",
      "Quantity",
      "Source Category / Reason",
      "Reference ID",
      "Staff Member",
      "Brought By",
      "Received By / Given To",
      "Unit Cost (BDT)",
      "Total Cost (BDT)",
      "Corrected",
      "Notes",
    ];

    const lines = rows.map((t) => {
      const d = t.transaction_date ? new Date(t.transaction_date) : null;
      const when = d
        ? d.toLocaleDateString("en-GB", { timeZone: "Asia/Dhaka" }) + " " +
          d.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" })
        : "";
      const isStockIn = t.transaction_type === "STOCK_IN" || t.transaction_type === "ADJUSTMENT_IN";
      const incomingQty = isStockIn ? t.quantity : "";
      const outgoingQty = !isStockIn ? t.quantity : "";

      return [
        t.transaction_number,
        when,
        t.product_name,
        t.sku,
        t.style_code,
        t.transaction_type,
        incomingQty,
        outgoingQty,
        t.quantity,
        t.source_category_snapshot || t.category_name || t.stock_out_reason || "",
        t.reference_id,
        t.staff_name,
        t.brought_by,
        t.received_by,
        t.unit_cost !== null && t.unit_cost !== undefined ? Number(t.unit_cost).toFixed(2) : "",
        t.total_cost !== null && t.total_cost !== undefined ? Number(t.total_cost).toFixed(2) : "",
        t.correction_id ? "Yes: " + (t.correction_reason || "") : "",
        t.notes,
      ].map(cell).join(",");
    });

    // BOM so Excel opens UTF-8 (Bangla names) correctly; CSV opens natively in Excel
    const csv = "\uFEFF" + [headers.map(cell).join(","), ...lines].join("\r\n");
    const filename = `stock-ledger-book-${filters.dateFilter}-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("GET /api/inventory/export error:", err);
    return new Response("Failed to generate CSV export", { status: 500 });
  }
}
