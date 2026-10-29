import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/types/database";

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
    let {
      product_id,
      product_name,
      sku,
      style_code,
      quantity,
      source_category_id,
      brought_by,
      received_by,
      reference_id,
      unit_cost,
      total_cost,
      transaction_date,
      notes,
      idempotency_key,
    } = body;

    const parsedQty = parseInt(quantity, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive number greater than 0" }, { status: 400 });
    }

    // Resolve Product
    let targetProductId = product_id;
    let resolvedProductName = (product_name || "").trim();

    if (!targetProductId && !resolvedProductName) {
      return NextResponse.json({ error: "Product name or selection is required" }, { status: 400 });
    }

    // If product_id not provided, find by name (case-insensitive) or create new product
    if (!targetProductId) {
      const { data: existing } = await supabase
        .from("inventory_products")
        .select("id, product_name, sku, style_code, status")
        .ilike("product_name", resolvedProductName)
        .limit(1);

      if (existing && existing.length > 0) {
        targetProductId = existing[0].id;
        resolvedProductName = existing[0].product_name;

        // If existing product lacks SKU or style_code, update them if provided
        const patchFields: TablesUpdate<"inventory_products"> = {};
        if (!existing[0].sku && sku?.trim()) patchFields.sku = sku.trim();
        if (!existing[0].style_code && style_code?.trim()) patchFields.style_code = style_code.trim();

        if (Object.keys(patchFields).length > 0) {
          patchFields.updated_at = new Date().toISOString();
          await supabase.from("inventory_products").update(patchFields).eq("id", targetProductId);
        }
      } else {
        // Create new product
        const { data: newProd, error: createError } = await supabase
          .from("inventory_products")
          .insert({
            product_name: resolvedProductName,
            sku: sku?.trim() || null,
            style_code: style_code?.trim() || null,
            status: "active",
            created_by: profile?.id || null,
          })
          .select()
          .single();

        if (createError) throw createError;
        targetProductId = newProd.id;
      }
    } else {
      // Product was explicitly selected: verify it exists and optionally update missing SKU / style code
      const { data: existingProd, error: checkError } = await supabase
        .from("inventory_products")
        .select("id, product_name, sku, style_code, status")
        .eq("id", targetProductId)
        .single();

      if (checkError || !existingProd) {
        return NextResponse.json({ error: "Selected product does not exist" }, { status: 404 });
      }

      resolvedProductName = existingProd.product_name;

      const patchFields: TablesUpdate<"inventory_products"> = {};
      if (!existingProd.sku && sku?.trim()) patchFields.sku = sku.trim();
      if (!existingProd.style_code && style_code?.trim()) patchFields.style_code = style_code.trim();

      if (Object.keys(patchFields).length > 0) {
        patchFields.updated_at = new Date().toISOString();
        await supabase.from("inventory_products").update(patchFields).eq("id", targetProductId);
      }
    }

    // Resolve Category Snapshot
    let sourceCategorySnapshot = null;
    if (source_category_id) {
      const { data: cat } = await supabase
        .from("inventory_source_categories")
        .select("name")
        .eq("id", source_category_id)
        .single();
      if (cat) {
        sourceCategorySnapshot = cat.name;
      }
    }

    // Auto-calculate total cost if unit_cost is present
    let numericUnitCost = unit_cost !== undefined && unit_cost !== null && unit_cost !== "" ? Number(unit_cost) : null;
    let numericTotalCost = total_cost !== undefined && total_cost !== null && total_cost !== "" ? Number(total_cost) : null;

    if (numericUnitCost !== null && !isNaN(numericUnitCost) && (numericTotalCost === null || isNaN(numericTotalCost))) {
      numericTotalCost = Math.round(numericUnitCost * parsedQty * 100) / 100;
    }

    const resolvedTxDate = transaction_date ? new Date(transaction_date).toISOString() : new Date().toISOString();

    // Call atomic record_stock_transaction function
    const { data: newTx, error: txError } = await supabase.rpc("record_stock_transaction", {
      p_product_id: targetProductId,
      p_transaction_type: "STOCK_IN",
      p_quantity: parsedQty,
      p_source_category_id: source_category_id || null,
      p_source_category_snapshot: sourceCategorySnapshot,
      p_stock_out_reason: null,
      p_reference_id: reference_id?.trim() || null,
      p_brought_by: brought_by?.trim() || null,
      p_received_by: received_by?.trim() || profile?.full_name || null,
      p_unit_cost: numericUnitCost,
      p_total_cost: numericTotalCost,
      p_notes: notes?.trim() || null,
      p_transaction_date: resolvedTxDate,
      p_created_by: profile?.id || null,
      p_idempotency_key: typeof idempotency_key === "string" && idempotency_key ? idempotency_key : null,
    });

    if (txError) throw txError;

    // Fetch updated product stock
    const { data: updatedStock } = await supabase
      .from("inventory_product_stock_view")
      .select("*")
      .eq("id", targetProductId)
      .single();

    return NextResponse.json({
      success: true,
      transaction: newTx,
      product: updatedStock,
      message: `Successfully received ${parsedQty} units of "${resolvedProductName}"`,
    }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/inventory/stock-in error:", err);
    return NextResponse.json({ error: err.message || "Failed to record Stock In" }, { status: 500 });
  }
}

