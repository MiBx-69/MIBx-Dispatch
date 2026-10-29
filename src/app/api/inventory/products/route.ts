import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/types/database";

export const dynamic = "force-dynamic";

// GET /api/inventory/products
export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const mode = searchParams.get("mode");
    const q = searchParams.get("q")?.trim() || "";
    const status = searchParams.get("status") || "active";
    const sortBy = searchParams.get("sortBy") || "updated_at";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? true : false;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10)));
    const offset = (page - 1) * pageSize;

    const supabase = createServiceClient();

    // Fast Autocomplete Mode
    if (mode === "autocomplete") {
      let query = supabase
        .from("inventory_product_stock_view")
        .select("id, product_id, product_name, sku, style_code, current_stock, status")
        .eq("status", "active")
        .limit(25);

      if (q) {
        query = query.or(`product_name.ilike.%${q}%,sku.ilike.%${q}%,style_code.ilike.%${q}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ products: data || [] });
    }

    // Standard Inventory View Query
    let query = supabase
      .from("inventory_product_stock_view")
      .select("*", { count: "exact" });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    if (q) {
      query = query.or(`product_name.ilike.%${q}%,sku.ilike.%${q}%,style_code.ilike.%${q}%`);
    }

    // Handle sort column mapping
    const validSortColumns = ["product_name", "sku", "style_code", "current_stock", "total_stock_in", "total_stock_out", "last_transaction_date", "updated_at", "created_at"];
    const resolvedSort = validSortColumns.includes(sortBy) ? sortBy : "updated_at";

    query = query
      .order(resolvedSort, { ascending: sortOrder, nullsFirst: false })
      .range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      products: data || [],
      count: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err: any) {
    console.error("GET /api/inventory/products error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch products" }, { status: 500 });
  }
}

// POST /api/inventory/products — Create a new product
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
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    const body = await request.json();
    const { product_name, sku, style_code, description, force = false } = body;

    const trimmedName = (product_name || "").trim();
    if (!trimmedName) {
      return NextResponse.json({ error: "Product name is required" }, { status: 400 });
    }

    const trimmedSku = sku?.trim() ? sku.trim() : null;
    const trimmedStyle = style_code?.trim() ? style_code.trim() : null;
    const trimmedDesc = description?.trim() ? description.trim() : null;

    // Check for potential duplicate if force is not true
    if (!force) {
      let duplicateQuery = supabase
        .from("inventory_products")
        .select("id, product_name, sku, style_code, status")
        .ilike("product_name", trimmedName);

      const { data: nameDuplicates } = await duplicateQuery;
      if (nameDuplicates && nameDuplicates.length > 0) {
        return NextResponse.json({
          warning: "A product with a similar name already exists.",
          existingProduct: nameDuplicates[0],
          isDuplicateWarning: true,
        }, { status: 409 });
      }

      if (trimmedSku) {
        const { data: skuDuplicates } = await supabase
          .from("inventory_products")
          .select("id, product_name, sku, style_code, status")
          .ilike("sku", trimmedSku);

        if (skuDuplicates && skuDuplicates.length > 0) {
          return NextResponse.json({
            warning: `A product with SKU "${trimmedSku}" already exists (${skuDuplicates[0].product_name}).`,
            existingProduct: skuDuplicates[0],
            isDuplicateWarning: true,
          }, { status: 409 });
        }
      }
    }

    // Insert new product
    const { data: newProduct, error: insertError } = await supabase
      .from("inventory_products")
      .insert({
        product_name: trimmedName,
        sku: trimmedSku,
        style_code: trimmedStyle,
        description: trimmedDesc,
        status: "active",
        created_by: profile?.id || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      product: newProduct,
      message: "Product created successfully",
    }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/inventory/products error:", err);
    return NextResponse.json({ error: err.message || "Failed to create product" }, { status: 500 });
  }
}

// PATCH /api/inventory/products — Update product details or archive/unarchive
export async function PATCH(request: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("user_id", user.id)
      .single();

    const body = await request.json();
    const { id, product_name, sku, style_code, description, status } = body;

    if (!id) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 });
    }

    // If archiving/unarchiving or updating, verify permissions
    const updates: TablesUpdate<"inventory_products"> = {
      updated_at: new Date().toISOString(),
    };

    if (product_name !== undefined) updates.product_name = product_name.trim();
    if (sku !== undefined) updates.sku = sku?.trim() || null;
    if (style_code !== undefined) updates.style_code = style_code?.trim() || null;
    if (description !== undefined) updates.description = description?.trim() || null;
    if (status !== undefined) {
      if (!["active", "archived"].includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = status;
    }

    const { data: updatedProduct, error } = await supabase
      .from("inventory_products")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      product: updatedProduct,
      message: "Product updated successfully",
    });
  } catch (err: any) {
    console.error("PATCH /api/inventory/products error:", err);
    return NextResponse.json({ error: err.message || "Failed to update product" }, { status: 500 });
  }
}

