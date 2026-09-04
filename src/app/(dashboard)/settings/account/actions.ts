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
    user_metadata: { full_name: fullName, force_password_reset: true }
  });

  if (error) return { error: error.message };

  if (data.user) {
    // Wait for trigger to create profile, then update role
    await new Promise(r => setTimeout(r, 1000));
    await supabaseAdmin
      .from("profiles")
      .update({ role })
      .eq("user_id", data.user.id);
      
    // Send email with temporary password
    const { sendEmail } = await import("@/lib/email");
    const appName = process.env.NEXT_PUBLIC_APP_NAME || "MiBx Dispatch";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mibxdispatch.vercel.app";
    
    await sendEmail(
      email,
      `You've been invited to ${appName}`,
      `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2>Welcome to ${appName}!</h2>
        <p>You have been invited by ${user.user_metadata?.full_name || user.email}.</p>
        <p>Your temporary password is: <strong>${tempPassword}</strong></p>
        <p>Please log in at <a href="${appUrl}/login">${appUrl}/login</a> using your email and this temporary password.</p>
        <p>You will be prompted to reset your password upon your first login.</p>
      </div>
      `
    );
  }

  revalidatePath("/settings/account");
  
  return { tempPassword };
}

export async function forceUpdatePassword(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  const password = formData.get("password")?.toString();
  const confirmPassword = formData.get("confirm_password")?.toString();

  if (!password || password !== confirmPassword) {
    return { error: "Passwords do not match or are empty." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  // Update password and clear force_password_reset flag
  const { error } = await supabase.auth.updateUser({
    password: password,
    data: { force_password_reset: false }
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  return { success: true };
}

export async function removeTeamMember(userId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized" };

  // Only admins can remove users
  const { data: currentUserProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (currentUserProfile?.role !== "admin") {
    return { error: "Only admins can remove users." };
  }

  // Prevent admin from deleting themselves
  if (userId === user.id) {
    return { error: "You cannot remove yourself." };
  }

  const supabaseAdmin = createServiceClient();
  
  // First, delete from profiles to avoid foreign key conflicts or trigger issues if any
  await supabaseAdmin.from("profiles").delete().eq("user_id", userId);

  // Then delete from auth.users using admin api
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) return { error: error.message };

  revalidatePath("/settings/account");
  return { success: true };
}
