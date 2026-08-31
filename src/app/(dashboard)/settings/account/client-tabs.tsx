"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { updateProfile, updateSecurity, inviteTeamMember } from "./actions";
import { UserCircle, Shield, Users, Key, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export function AccountTabs({ userProfile, teamProfiles }: { userProfile: any, teamProfiles: any[] }) {
  const [activeTab, setActiveTab] = useState<"profile" | "security" | "team">("profile");

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        <button 
          onClick={() => setActiveTab("profile")}
          className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'profile' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
          <div className="flex items-center gap-2"><UserCircle className="w-4 h-4" /> My Profile</div>
        </button>
        <button 
          onClick={() => setActiveTab("security")}
          className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'security' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
          <div className="flex items-center gap-2"><Shield className="w-4 h-4" /> Security</div>
        </button>
        <button 
          onClick={() => setActiveTab("team")}
          className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${activeTab === 'team' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
          <div className="flex items-center gap-2"><Users className="w-4 h-4" /> Team Management</div>
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {/* PROFILE TAB */}
        {activeTab === "profile" && (
          <div className="p-6 animate-fade-in">
            <h3 className="text-sm font-medium text-zinc-200 mb-4">Personal Information</h3>
            <ActionForm action={updateProfile} successMessage="Profile updated" className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400">Full Name</label>
                    <input type="text" name="full_name" defaultValue={userProfile?.full_name || ""} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400">Role</label>
                    <input type="text" disabled defaultValue={userProfile?.role || "staff"} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-500 text-sm cursor-not-allowed uppercase" />
                  </div>
                  <div className="pt-2">
                    <SubmitButton className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium">
                      Save Changes
                    </SubmitButton>
                  </div>
            </ActionForm>
          </div>
        )}

        {/* SECURITY TAB */}
        {activeTab === "security" && (
          <div className="p-6 animate-fade-in space-y-8">
            <div>
              <h3 className="text-sm font-medium text-zinc-200 mb-4">Change Password</h3>
              <ActionForm action={updateSecurity} successMessage="Password updated successfully" className="space-y-4 max-w-md">
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">New Password</label>
                      <input type="password" name="password" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Confirm Password</label>
                      <input type="password" name="confirm_password" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50" />
                    </div>
                    <div className="pt-2">
                      <SubmitButton className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium">
                        Update Password
                      </SubmitButton>
                    </div>
              </ActionForm>
            </div>
            
            <div className="border-t border-zinc-800/50 pt-8 max-w-md">
              <h3 className="text-sm font-medium text-zinc-200 mb-2 flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" /> 
                Passkeys (WebAuthn)
              </h3>
              <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
                Log in securely without a password using your device's biometrics (FaceID, TouchID, Windows Hello).
              </p>
              <button 
                type="button" 
                onClick={async () => {
                  try {
                    const { createClient } = await import('@/lib/supabase/client');
                    const supabase = createClient();
                    
                    const { data, error } = await supabase.auth.mfa.enroll({
                      factorType: 'webauthn',
                    });
                    
                    if (error) throw error;
                    
                    const challenge = await supabase.auth.mfa.challenge({
                      factorId: data.id,
                    });
                    
                    if (challenge.error) throw challenge.error;
                    
                    toast.success("Passkey registered successfully!");
                  } catch (err: any) {
                    console.error("Passkey error:", err);
                    if (err.message && err.message.includes('MFA enroll is disabled for WebAuthn')) {
                      toast.error("WebAuthn is disabled in your Supabase project. Please enable it in Supabase Dashboard -> Authentication -> Providers -> Multi-Factor Authentication.", { duration: 10000 });
                    } else {
                      toast.error(err.message || "Failed to register passkey. Ensure your browser supports WebAuthn and you are on a secure context (HTTPS).");
                    }
                  }
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-lg text-sm font-medium transition-colors"
              >
                Register new Passkey
              </button>
            </div>
          </div>
        )}

        {/* TEAM TAB */}
        {activeTab === "team" && (
          <div className="animate-fade-in">
            <div className="p-6 border-b border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-200 mb-4">Invite Team Member</h3>
              {userProfile?.role !== 'admin' && (
                <div className="mb-4 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-orange-200 leading-relaxed">
                    Only administrators can invite new team members or modify roles.
                  </p>
                </div>
              )}
              <ActionForm 
                action={async (fd) => {
                  if (userProfile?.role !== 'admin') return { error: "Only admins can invite users." };
                  const res = await inviteTeamMember(fd);
                  if (res?.tempPassword) {
                    toast.success(`User invited! Temp Password: ${res.tempPassword}`, { duration: 10000 });
                  }
                  return res;
                }} 
                className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
              >
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Full Name</label>
                      <input type="text" name="full_name" required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Email</label>
                      <input type="email" name="email" required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-zinc-400">Role</label>
                      <select name="role" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm focus:outline-none focus:border-indigo-500/50">
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="w-full">
                      <SubmitButton className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm font-medium">
                        Send Invite
                      </SubmitButton>
                    </div>
              </ActionForm>
            </div>
            
            <div className="p-0">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-zinc-950 border-b border-zinc-800 text-zinc-500 uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-6 py-3 font-semibold">User</th>
                    <th className="px-6 py-3 font-semibold">Role</th>
                    <th className="px-6 py-3 font-semibold">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {teamProfiles.map(profile => (
                    <tr key={profile.id} className="hover:bg-zinc-800/20 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-medium text-zinc-200">{profile.full_name || "Unknown"}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider ${
                          profile.role === 'admin' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                        }`}>
                          {profile.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-zinc-500">
                        {new Date(profile.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                  {teamProfiles.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-8 text-center text-zinc-500">
                        No team members found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
