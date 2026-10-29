import { Metadata } from "next";
import { createServiceClient, createClient } from "@/lib/supabase/server";
import { CategoryManagerClient } from "@/components/inventory/category-manager-client";
import type { InventorySourceCategory } from "@/types/inventory";

export const metadata: Metadata = {
  title: "Source Categories — MiBx Dispatch",
  description: "Manage product source categories for inventory tracking",
};

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();

  const supabase = createServiceClient();
  const [{ data: categories }, { data: profile }] = await Promise.all([
    supabase
      .from("inventory_source_categories")
      .select("*")
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user?.id || "")
      .single(),
  ]);

  const isAdmin = profile?.role === "admin";

  return (
    <CategoryManagerClient
      categories={(categories || []) as unknown as InventorySourceCategory[]}
      isAdmin={isAdmin}
    />
  );
}

