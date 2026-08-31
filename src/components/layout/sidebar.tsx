"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Users,
  Settings,
  Package,
  LogOut,
  Zap,
  Wallet,
} from "lucide-react";
import type { Profile } from "@/types/database";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/dispatches", label: "Dispatches", icon: Truck },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/finances/sales-report", label: "Reports", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  profile: Profile | null;
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-60 h-full bg-zinc-900 border-r border-zinc-800 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-zinc-800">
        <div className="flex items-center justify-center w-9 h-9 rounded-xl overflow-hidden bg-white shrink-0">
          <img src="/logo.png" alt="MiBx Logo" className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="text-sm font-bold text-white leading-none">MiBx Dispatch v3</p>
          <p className="text-xs text-zinc-500 mt-0.5">ERP System</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                         transition-all duration-150 group ${
                           isActive
                             ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/20"
                             : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                         }`}
            >
              <Icon
                className={`w-4.5 h-4.5 ${
                  isActive ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-300"
                }`}
                size={18}
              />
              {label}
              {label === "Orders" && (
                <span className="ml-auto text-xs bg-indigo-600/30 text-indigo-300 px-1.5 py-0.5 rounded-full font-medium">
                  Live
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Quick sync */}
      <div className="px-3 pb-2">
        <button
          onClick={() => {
            fetch("/api/sync/shopify", { method: "POST" }).then(() => {
              window.location.reload();
            });
          }}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-500
                     hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <Zap size={14} />
          Sync Shopify Orders
        </button>
      </div>

      {/* User section */}
      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/30
                         flex items-center justify-center text-xs font-bold text-indigo-400 shrink-0">
            {profile?.full_name?.[0]?.toUpperCase() || "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-zinc-200 truncate">
              {profile?.full_name || "User"}
            </p>
            <p className="text-xs text-zinc-600 truncate capitalize">
              {profile?.role || "staff"}
            </p>
          </div>
          <a
            href="/api/auth/logout"
            className="text-zinc-600 hover:text-red-400 transition-colors"
            title="Sign out"
          >
            <LogOut size={15} />
          </a>
        </div>
        
        {/* Copyright */}
        <div className="px-2 pt-3 pb-1 text-center">
          <p className="text-[10px] text-zinc-600" suppressHydrationWarning>
            &copy; {new Date().getFullYear()} MiBx Dispatch.<br />
            Developed by Moinul Islam.
          </p>
        </div>
      </div>
    </aside>
  );
}
