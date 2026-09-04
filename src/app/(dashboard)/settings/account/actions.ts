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
      <!DOCTYPE html>
      <html>
      <body style="margin: 0; padding: 0; background-color: #09090b; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #09090b; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="100%" max-width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 600px; background-color: #18181b; border: 1px solid #27272a; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
                
                <!-- Header -->
                <tr>
                  <td style="padding: 40px 40px 20px 40px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">Welcome to ${appName}</h1>
                  </td>
                </tr>

                <!-- Content -->
                <tr>
                  <td style="padding: 20px 40px;">
                    <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 24px; color: #a1a1aa;">
                      You have been invited by <strong>${user.user_metadata?.full_name || user.email}</strong> to join the team.
                    </p>

                    <div style="background-color: #09090b; border: 1px solid #27272a; border-radius: 8px; padding: 24px; margin-bottom: 32px;">
                      <p style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #71717a; font-weight: 600;">Your Login Details</p>
                      
                      <p style="margin: 0 0 12px 0; font-size: 15px; color: #e4e4e7;">
                        <span style="color: #a1a1aa; display: inline-block; width: 80px;">Email:</span> 
                        <strong>${email}</strong>
                      </p>
                      
                      <p style="margin: 0; font-size: 15px; color: #e4e4e7;">
                        <span style="color: #a1a1aa; display: inline-block; width: 80px;">Password:</span> 
                        <span style="background-color: #27272a; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 16px; color: #6366f1; letter-spacing: 1px; font-weight: bold;">${tempPassword}</span>
                      </p>
                    </div>

                    <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 22px; color: #a1a1aa;">
                      For security reasons, you will be required to choose a new private password immediately upon your first login.
                    </p>

                    <!-- Button -->
                    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td align="center" style="padding-top: 10px;">
                          <a href="${appUrl}/login" style="display: inline-block; background-color: #6366f1; color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 8px; transition: background-color 0.2s;">
                            Log in to your account
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding: 30px 40px; text-align: center; border-top: 1px solid #27272a; background-color: #121214;">
                    <p style="margin: 0; font-size: 12px; color: #71717a;">
                      If you did not expect this invitation, you can safely ignore this email.
                    </p>
                  </td>
                </tr>

              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
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
