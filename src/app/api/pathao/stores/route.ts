import { NextRequest, NextResponse } from "next/server";
import { getPathaoStores } from "@/lib/pathao/client";
import { createServiceClient, createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const data = await getPathaoStores();
    const stores = data.data?.data || [];

    // Check backend default store from app_settings
    let defaultStoreId: number | null = null;
    try {
      const supabase = createServiceClient();
      const { data: settings } = await supabase
        .from("app_settings")
        .select("id, pathao_store_id")
        .single();

      if (settings?.pathao_store_id) {
        defaultStoreId = settings.pathao_store_id;
      } else if (stores.length > 0) {
        // Fallback to Pathao's default store or first store
        const pathaoDefault = stores.find((s: any) => s.is_default_store);
        defaultStoreId = pathaoDefault ? pathaoDefault.store_id : stores[0].store_id;

        // Persist default store to app_settings if previously null
        if (settings?.id && defaultStoreId) {
          await supabase
            .from("app_settings")
            .update({ pathao_store_id: defaultStoreId })
            .eq("id", settings.id);
        }
      }
    } catch (dbErr) {
      console.error("[Stores API] Failed to read/persist default store from app_settings:", dbErr);
    }

    return NextResponse.json({
      stores,
      default_store_id: defaultStoreId,
    });
  } catch (error: any) {
    console.error("Fetch stores error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stores" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { default_store_id } = body;

    if (!default_store_id) {
      return NextResponse.json({ error: "default_store_id is required" }, { status: 400 });
    }

    const supabase = createServiceClient();
    const { data: settings } = await supabase
      .from("app_settings")
      .select("id")
      .single();

    if (settings?.id) {
      await supabase
        .from("app_settings")
        .update({ pathao_store_id: Number(default_store_id) })
        .eq("id", settings.id);
    }

    return NextResponse.json({ success: true, default_store_id: Number(default_store_id) });
  } catch (err: any) {
    console.error("Set default store error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
