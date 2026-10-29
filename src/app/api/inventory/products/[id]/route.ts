import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    const supabase = createServiceClient();

    // 1. Fetch product summary from stock view
    const { data: productSummary, error: productError } = await supabase
      .from("inventory_product_stock_view")
      .select("*")
      .eq("id", id)
      .single();

    if (productError || !productSummary) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // 2. Fetch all chronological transactions for this product
    const { data: transactions, error: txError } = await supabase
      .from("inventory_transactions")
      .select(`
        *,
        inventory_source_categories (
          id,
          name
        ),
        profiles:created_by (
          id,
          full_name,
          role
        ),
        corrections:inventory_transaction_corrections!original_transaction_id (
          id,
          reason,
          created_at,
          profiles:created_by (full_name)
        )
      `)
      .eq("product_id", id)
      .order("transaction_date", { ascending: false });

    if (txError) throw txError;

    return NextResponse.json({
      product: productSummary,
      transactions: transactions || [],
    });
  } catch (err: any) {
    console.error("GET /api/inventory/products/[id] error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch product ledger" }, { status: 500 });
  }
}

