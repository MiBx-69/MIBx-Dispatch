import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveDateRange } from "@/lib/reporting-engine";
import type { InventoryTransaction } from "@/types/inventory";

export interface LedgerFilters {
  search?: string;
  type?: string; // all | STOCK_IN | STOCK_OUT
  productId?: string;
  categoryId?: string;
  reason?: string;
  staffId?: string;
  dateFilter?: string;
  startDate?: string;
  endDate?: string;
}

/** Strip characters that would break a PostgREST `or()` expression or act as LIKE wildcards. */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[,()"\\%_*]/g, " ").replace(/\s+/g, " ").trim();
}

/** Apply identical filters for list, pagination and export. */
export function applyLedgerFilters<T>(query: T, f: LedgerFilters): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = query;

  if (f.type && f.type !== "all") {
    if (f.type === "STOCK_IN") q = q.in("transaction_type", ["STOCK_IN", "ADJUSTMENT_IN"]);
    else if (f.type === "STOCK_OUT") q = q.in("transaction_type", ["STOCK_OUT", "ADJUSTMENT_OUT"]);
    else q = q.eq("transaction_type", f.type);
  }
  if (f.productId) q = q.eq("product_id", f.productId);
  if (f.categoryId) q = q.eq("source_category_id", f.categoryId);
  if (f.reason) q = q.eq("stock_out_reason", f.reason);
  if (f.staffId) q = q.eq("created_by", f.staffId);

  const { startDateStr, endDateStr } = resolveDateRange(
    f.dateFilter || "all",
    f.startDate || undefined,
    f.endDate || undefined
  );
  if (startDateStr && endDateStr) {
    q = q.gte("transaction_date", startDateStr).lte("transaction_date", endDateStr);
  }

  const s = f.search ? sanitizeSearchTerm(f.search) : "";
  if (s) {
    const cols = [
      "transaction_number",
      "product_name",
      "sku",
      "style_code",
      "reference_id",
      "category_name",
      "source_category_snapshot",
      "staff_name",
      "brought_by",
      "received_by",
      "notes",
      "stock_out_reason",
    ];
    q = q.or(cols.map((c) => `${c}.ilike.%${s}%`).join(","));
  }
  return q as T;
}

/** Maps a flat ledger view row to the nested shape used by the UI components. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapLedgerRow(r: any): InventoryTransaction {
  return {
    id: r.id,
    transaction_number: r.transaction_number,
    product_id: r.product_id,
    transaction_type: r.transaction_type,
    quantity: r.quantity,
    source_category_id: r.source_category_id,
    source_category_snapshot: r.source_category_snapshot,
    stock_out_reason: r.stock_out_reason,
    reference_id: r.reference_id,
    brought_by: r.brought_by,
    received_by: r.received_by,
    unit_cost: r.unit_cost,
    total_cost: r.total_cost,
    notes: r.notes,
    transaction_date: r.transaction_date,
    created_by: r.created_by,
    created_at: r.created_at,
    inventory_products: {
      id: r.product_id,
      product_name: r.product_name,
      sku: r.sku,
      style_code: r.style_code,
      status: r.product_status,
    } as InventoryTransaction["inventory_products"],
    profiles: r.created_by
      ? { id: r.created_by, full_name: r.staff_name, role: "" }
      : null,
    corrections: r.correction_id
      ? [
          {
            id: r.correction_id,
            original_transaction_id: r.id,
            correction_transaction_id: "",
            reason: r.correction_reason,
            created_by: null,
            created_at: r.corrected_at,
            profiles: { id: "", full_name: r.corrected_by_name, role: "" },
          },
        ]
      : [],
  };
}

export async function fetchLedgerPage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  filters: LedgerFilters,
  page: number,
  pageSize: number
) {
  const offset = (page - 1) * pageSize;
  const base = supabase.from("inventory_ledger_view").select("*", { count: "exact" });
  const { data, count, error } = await applyLedgerFilters(base, filters)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) throw error;
  return { transactions: (data || []).map(mapLedgerRow), count: count || 0 };
}

