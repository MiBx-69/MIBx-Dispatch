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
      product_name,
      sku,
      style_code,
      is_custom_product,
      allow_office_stock,
      quantity,
      stock_out_reason,
      reference_id,
      given_to,
      received_by,
      transaction_date,
      notes,
      idempotency_key,
    } = body;

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive number greater than 0" }, { status: 400 });
    }

    let resolvedProductId: string | null = product_id || null;
    let resolvedProductName: string = "";

    // 1. Handle Custom Product or Non-catalog Office Stock
    if (is_custom_product || (!resolvedProductId && product_name?.trim())) {
      const cleanName = (product_name || "").trim();
      if (!cleanName) {
        return NextResponse.json({ error: "Custom product name is required" }, { status: 400 });
      }

      resolvedProductName = cleanName;

      // Check if product with this exact name already exists
      const { data: existingProd } = await supabase
        .from("inventory_products")
        .select("id, product_name")
        .ilike("product_name", cleanName)
        .maybeSingle();

      if (existingProd) {
        resolvedProductId = existingProd.id;
      } else {
        // Create new inventory product record
        const { data: createdProd, error: createErr } = await supabase
          .from("inventory_products")
          .insert({
            product_name: cleanName,
            sku: sku?.trim() || null,
            style_code: style_code?.trim() || null,
            status: "active",
            created_by: profile?.id || null,
          })
          .select("id, product_name")
          .single();

        if (createErr || !createdProd) {
          throw new Error("Failed to register custom product: " + (createErr?.message || "Unknown error"));
        }

        resolvedProductId = createdProd.id;
      }
    } else {
      // Existing product ID was provided
      if (!resolvedProductId) {
        return NextResponse.json({ error: "Product selection or custom product name is required" }, { status: 400 });
      }

      const { data: productSummary, error: prodError } = await supabase
        .from("inventory_products")
        .select("id, product_name")
        .eq("id", resolvedProductId)
        .single();

      if (prodError || !productSummary) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }

      resolvedProductName = productSummary.product_name;
    }

    // 2. Check current available stock from view
    const { data: stockSummary } = await supabase
      .from("inventory_product_stock_view")
      .select("current_stock")
      .eq("id", resolvedProductId)
      .maybeSingle();

    const availableStock = stockSummary?.current_stock || 0;
    const resolvedTxDate = transaction_date ? new Date(transaction_date).toISOString() : new Date().toISOString();

    // 3. If quantity exceeds recorded ledger stock, auto-balance office stock if permitted
    const isOfficePhysicalStock = Boolean(is_custom_product || allow_office_stock);

    if (parsedQty > availableStock) {
      if (!isOfficePhysicalStock) {
        return NextResponse.json({
          error: `Insufficient stock for "${resolvedProductName}". Available in ledger: ${availableStock}, requested: ${parsedQty}. Check "Available in office" to proceed.`,
          availableStock,
          requestedQuantity: parsedQty,
        }, { status: 400 });
      }

      // Automatically record initial office stock receipt so ledger remains mathematically consistent
      const deficit = parsedQty - availableStock;
      const autoInIdempotency = idempotency_key ? `office-in-${idempotency_key}` : null;

      const { error: autoInErr } = await supabase.rpc("record_stock_transaction", {
        p_product_id: resolvedProductId,
        p_transaction_type: "STOCK_IN",
        p_quantity: deficit,
        p_source_category_id: null,
        p_source_category_snapshot: "Office Physical Stock",
        p_stock_out_reason: null,
        p_reference_id: reference_id?.trim() || "OFFICE-PHYSICAL",
        p_brought_by: "Office Inventory",
        p_received_by: profile?.full_name || "Office Staff",
        p_unit_cost: null,
        p_total_cost: null,
        p_notes: is_custom_product
          ? `Auto-credited physical office stock for custom outgoing product: ${resolvedProductName}`
          : `Auto-credited physical office stock for outgoing dispatch: ${resolvedProductName}`,
        p_transaction_date: resolvedTxDate,
        p_created_by: profile?.id || null,
        p_idempotency_key: autoInIdempotency,
      });

      if (autoInErr) {
        console.error("Auto-balance office stock error:", autoInErr);
        return NextResponse.json({
          error: autoInErr.message || "Failed to auto-balance office stock",
        }, { status: 400 });
      }
    }

    // 4. Execute atomic database function for STOCK_OUT
    const { data: newTx, error: txError } = await supabase.rpc("record_stock_transaction", {
      p_product_id: resolvedProductId,
      p_transaction_type: "STOCK_OUT",
      p_quantity: parsedQty,
      p_source_category_id: null,
      p_source_category_snapshot: null,
      p_stock_out_reason: stock_out_reason?.trim() || (is_custom_product ? "Custom Office Stock Out" : "Online Order"),
      p_reference_id: reference_id?.trim() || null,
      p_brought_by: null,
      p_received_by: (given_to || received_by)?.trim() || null,
      p_unit_cost: null,
      p_total_cost: null,
      p_notes: notes?.trim() || (is_custom_product ? "Custom office stock out" : null),
      p_transaction_date: resolvedTxDate,
      p_created_by: profile?.id || null,
      p_idempotency_key: typeof idempotency_key === "string" && idempotency_key ? idempotency_key : null,
    });

    if (txError) {
      return NextResponse.json({
        error: txError.message || "Failed to record Stock Out at database level",
      }, { status: 400 });
    }

    // 5. Fetch updated stock
    const { data: updatedProduct } = await supabase
      .from("inventory_product_stock_view")
      .select("*")
      .eq("id", resolvedProductId)
      .single();

    return NextResponse.json({
      success: true,
      transaction: newTx,
      product: updatedProduct,
      message: `Successfully recorded stock out of ${parsedQty} units for "${resolvedProductName}"`,
    }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/inventory/stock-out error:", err);
    return NextResponse.json({ error: err.message || "Failed to record Stock Out" }, { status: 500 });
  }
}
