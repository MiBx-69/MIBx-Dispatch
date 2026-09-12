"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateShopifyCredentials(formData: FormData) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: "Unauthorized" };
  }

  const shop_domain = formData.get("shop_domain")?.toString().trim().replace(/^https?:\/\//, "").replace(/\/$/, "") || "";
  const access_token = formData.get("access_token")?.toString().trim() || "";

  if (!shop_domain) {
    return { error: "Shop domain is required." };
  }

  if (!access_token) {
    return { error: "Access token is required." };
  }

  // Validate credentials with Shopify API
  try {
    const apiVersion = process.env.SHOPIFY_API_VERSION || "2024-07";
    const res = await fetch(`https://${shop_domain}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": access_token,
      },
      body: JSON.stringify({
        query: "{ shop { name myshopifyDomain } }",
      }),
    });

    const data = await res.json();
    if (!res.ok || data.errors || !data.data?.shop) {
      return { 
        error: data.errors?.[0]?.message || "Could not connect to Shopify. Please verify the domain and access token." 
      };
    }

    const verifiedShopName = data.data.shop.name;

    const supabaseAdmin = createServiceClient();
    const { data: settings } = await supabaseAdmin.from("app_settings").select("id").limit(1).single();

    if (settings) {
      await supabaseAdmin.from("app_settings").update({
        shopify_shop_domain: shop_domain,
        shopify_access_token: access_token,
      }).eq("id", settings.id);
    } else {
      await supabaseAdmin.from("app_settings").insert({
        system_name: "MiBx Dispatch",
        shopify_shop_domain: shop_domain,
        shopify_access_token: access_token,
      });
    }

    revalidatePath("/settings/shopify");
    return { success: true, message: `Connected successfully to store: ${verifiedShopName}` };
  } catch (err: any) {
    return { error: err.message || "Failed to verify Shopify credentials" };
  }
}
