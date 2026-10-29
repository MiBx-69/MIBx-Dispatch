import { NextRequest, NextResponse } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/types/database";

export const dynamic = "force-dynamic";

// GET /api/inventory/categories
export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const includeInactive = searchParams.get("includeInactive") === "true";
    const q = searchParams.get("q")?.trim() || "";

    const supabase = createServiceClient();

    let query = supabase
      .from("inventory_source_categories")
      .select("*")
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    if (q) {
      query = query.ilike("name", `%${q}%`);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ categories: data || [] });
  } catch (err: any) {
    console.error("GET /api/inventory/categories error:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch categories" }, { status: 500 });
  }
}

// POST /api/inventory/categories — Create category (Admin only)
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

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin privileges required." }, { status: 403 });
    }

    const body = await request.json();
    const { name, description } = body;

    const trimmedName = (name || "").trim();
    if (!trimmedName) {
      return NextResponse.json({ error: "Category name is required." }, { status: 400 });
    }

    // Check duplicate name
    const { data: existing } = await supabase
      .from("inventory_source_categories")
      .select("id")
      .ilike("name", trimmedName)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "A category with this name already exists." }, { status: 409 });
    }

    const { data: newCategory, error } = await supabase
      .from("inventory_source_categories")
      .insert({
        name: trimmedName,
        description: description?.trim() || null,
        is_active: true,
        created_by: profile.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      category: newCategory,
      message: "Category created successfully",
    }, { status: 201 });
  } catch (err: any) {
    console.error("POST /api/inventory/categories error:", err);
    return NextResponse.json({ error: err.message || "Failed to create category" }, { status: 500 });
  }
}

// PATCH /api/inventory/categories — Edit or activate/deactivate category (Admin only)
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

    if (profile?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden: Admin privileges required." }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, description, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: "Category ID is required." }, { status: 400 });
    }

    const updates: TablesUpdate<"inventory_source_categories"> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      const trimmedName = name.trim();
      if (!trimmedName) return NextResponse.json({ error: "Category name cannot be empty." }, { status: 400 });
      updates.name = trimmedName;
    }
    if (description !== undefined) updates.description = description?.trim() || null;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);

    const { data: updatedCategory, error } = await supabase
      .from("inventory_source_categories")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      category: updatedCategory,
      message: "Category updated successfully",
    });
  } catch (err: any) {
    console.error("PATCH /api/inventory/categories error:", err);
    return NextResponse.json({ error: err.message || "Failed to update category" }, { status: 500 });
  }
}

