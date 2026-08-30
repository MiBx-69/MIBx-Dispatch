"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const fullName = formData.get("full_name")?.toString();

  const supabaseAdmin = createServiceClient();
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ full_name: fullName })
    .eq("user_id", user.id);

  if (error) return { error: "Failed to update profile." };
  
  // also update user metadata in auth.users
  await supabaseAdmin.auth.admin.updateUserById(user.id, {
    user_metadata: { full_name: fullName }
  });

  revalidatePath("/settings/account");
}

export async function updateSecurity(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirm_password")?.toString();

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  if (password && password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const { error } = await supabase.auth.updateUser({
    password: password
  });

  if (error) return { error: error.message };

  revalidatePath("/settings/account");
}

export async function inviteTeamMember(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const email = formData.get("email")?.toString();
  const role = formData.get("role")?.toString() || "staff";
  const fullName = formData.get("full_name")?.toString() || "New Member";

  if (!email) return { error: "Email is required." };

  const supabaseAdmin = createServiceClient();
  
  // We'll just generate a secure temporary password
  const tempPassword = Math.random().toString(36).slice(-10) + "A1!";

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });

  if (error) return { error: error.message };

  if (data.user) {
    // Wait for trigger to create profile, then update role
    await new Promise(r => setTimeout(r, 1000));
    await supabaseAdmin
      .from("profiles")
      .update({ role })
      .eq("user_id", data.user.id);
  }

  revalidatePath("/settings/account");
  
  // Actually, we should probably return the temp password to the admin so they can share it
  return { tempPassword };
}
