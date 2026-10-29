import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const {
      product_id,
      quantity,
      stock_out_reason,
      reference_id,
      given_to,
      received_by,
      transaction_date,
      notes,
      idempotency_key,
    } = body;

    if (!product_id) {
      return NextResponse.json({ error: "Product selection is required" }, { status: 400 });
    }

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive number greater than 0" }, { status: 400 });
    }

    // 1. Check current available stock from view before attempting transaction
    const { data: productSummary, error: prodError } = await supabase
      .from("inventory_product_stock_view")
      .select("*")
      .eq("id", product_id)
      .single();

    if (prodError || !productSummary) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const availableStock = productSummary.current_stock || 0;
    if (parsedQty > availableStock) {
      return NextResponse.json({
        error: `Insufficient stock for "${productSummary.product_name}". Available: ${availableStock}, requested: ${parsedQty}`,
        availableStock,
        requestedQuantity: parsedQty,
      }, { status: 400 });
    }

    const resolvedTxDate = transaction_date ? new Date(transaction_date).toISOString() : new Date().toISOString();

    // 2. Execute atomic database function (locks row FOR UPDATE & re-validates stock at DB transaction level)
    const { data: newTx, error: txError } = await supabase.rpc("record_stock_transaction", {
      p_product_id: product_id,
      p_transaction_type: "STOCK_OUT",
      p_quantity: parsedQty,
      p_source_category_id: null,
      p_source_category_snapshot: null,
      p_stock_out_reason: stock_out_reason?.trim() || "Online Order",
      p_reference_id: reference_id?.trim() || null,
      p_brought_by: null,
      p_received_by: (given_to || received_by)?.trim() || null,
      p_unit_cost: null,
      p_total_cost: null,
      p_notes: notes?.trim() || null,
      p_transaction_date: resolvedTxDate,
      p_created_by: profile?.id || null,
      p_idempotency_key: typeof idempotency_key === "string" && idempotency_key ? idempotency_key : null,
    });

    if (txError) {
      return NextResponse.json({
        error: txError.message || "Failed to record Stock Out at database level",
      }, { status: 400 });
    }

    // 3. Fetch updated stock
    const { data: updatedProduct } = await supabase
      .from("inventory_product_stock_view")
      .select("*")
      .eq("id", product_id)
      .single();

    return NextResponse.json({
      success: true,
      transaction: newTx,
      product: updatedProduct,
      message: `Successfully recorded stock out of ${parsedQty} units for "${productSummary.product_name}"`,
    }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/inventory/stock-out error:", err);
    return NextResponse.json({ error: err.message || "Failed to record Stock Out" }, { status: 500 });
  }
}

