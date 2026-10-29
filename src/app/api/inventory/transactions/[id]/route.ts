import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/inventory/transactions/[id]
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
    const supabase = createServiceClient();

    const { data: transaction, error } = await supabase
      .from("inventory_transactions")
      .select(`
        *,
        inventory_products (
          id,
          product_name,
          sku,
          style_code,
          status
        ),
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
      .eq("id", id)
      .single();

    if (error || !transaction) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    return NextResponse.json({ transaction });
  } catch (err: any) {
    console.error("GET /api/inventory/transactions/[id] error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch transaction" }, { status: 500 });
  }
}

// POST /api/inventory/transactions/[id] — Correct / Reverse transaction (Admin only)
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, role")
      .eq("user_id", user.id)
      .single();

    // Check Administrator permissions
    if (profile?.role !== "admin") {
      return NextResponse.json({
        error: "Forbidden: Only administrators can perform transaction corrections or reversals.",
      }, { status: 403 });
    }

    const { id: originalTxId } = await context.params;
    const body = await request.json();
    const { reason, new_quantity, action = "reverse" } = body;

    const trimmedReason = (reason || "").trim();
    if (!trimmedReason) {
      return NextResponse.json({ error: "A detailed reason for correction is required." }, { status: 400 });
    }

    if (action !== "reverse" && action !== "adjust") {
      return NextResponse.json({ error: "Invalid correction action specified" }, { status: 400 });
    }

    // Atomic: adjustment transaction + audit link are written in one DB transaction
    const { data: adjustmentTx, error: rpcError } = await supabase.rpc("correct_stock_transaction", {
      p_original_transaction_id: originalTxId,
      p_action: action,
      p_reason: trimmedReason,
      p_new_quantity: action === "adjust" ? parseInt(new_quantity, 10) : null,
      p_created_by: profile.id,
    });

    if (rpcError) {
      return NextResponse.json({ error: `Correction failed: ${rpcError.message}` }, { status: 400 });
    }

    const { data: originalTx } = await supabase
      .from("inventory_transactions")
      .select("transaction_number, product_id")
      .eq("id", originalTxId)
      .single();

    const { data: updatedProduct } = originalTx
      ? await supabase
          .from("inventory_product_stock_view")
          .select("*")
          .eq("id", originalTx.product_id)
          .single()
      : { data: null };

    return NextResponse.json({
      success: true,
      adjustmentTransaction: adjustmentTx,
      product: updatedProduct,
      message: `Transaction ${originalTx?.transaction_number ?? ""} was corrected and offset with ${adjustmentTx?.transaction_number ?? "an adjustment"}.`,
    });
  } catch (err: any) {
    console.error("POST /api/inventory/transactions/[id] correction error:", err);
    return NextResponse.json({ error: err.message || "Failed to correct transaction" }, { status: 500 });
  }
}

