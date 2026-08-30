import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";
import { TopBar } from "@/components/layout/top-bar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="flex h-dvh bg-zinc-950 overflow-hidden">
      {/* Desktop sidebar */}
      <Sidebar profile={profile} />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile: shows menu + title; desktop: breadcrumb) */}
        <TopBar profile={profile} />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-6">
          <div className="max-w-7xl mx-auto px-4 py-4 lg:px-6 lg:py-6">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  );
}
