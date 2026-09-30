import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export interface AuthContext {
  user: {
    id: string;
    email?: string;
    user_metadata?: Record<string, any>;
  };
  profile: ProfileRow;
}

/**
 * Asserts that a valid authenticated user session exists.
 * Throws an Error if unauthenticated.
 */
export async function requireAuth(): Promise<AuthContext> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized: Please log in to perform this action.");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("Unauthorized: User profile not found.");
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata,
    },
    profile,
  };
}

/**
 * Asserts that the authenticated user has the 'admin' role.
 * Throws an Error if unauthenticated or not an admin.
 */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireAuth();

  if (ctx.profile.role !== "admin") {
    throw new Error("Forbidden: This action requires administrator privileges.");
  }

  return ctx;
}
