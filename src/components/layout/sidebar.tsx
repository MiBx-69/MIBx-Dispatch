"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  RotateCcw,
  Users,
  Settings,
  PackageCheck,
  LogOut,
  Zap,
  Wallet,
  ChevronLeft,
  ChevronRight,
  BarChart
} from "lucide-react";
import type { Profile } from "@/types/database";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/dispatches", label: "Dispatches", icon: Truck },
  { href: "/orders?status=delivered", label: "Deliveries", icon: PackageCheck },
  { href: "/returns", label: "Returns", icon: RotateCcw },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/finances", label: "Finances", icon: Wallet },
  { href: "/reports", label: "Reports", icon: BarChart },
  { href: "/settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  profile: Profile | null;
}

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <aside className={`hidden lg:flex flex-col h-full bg-zinc-900 border-r border-zinc-800 shrink-0 transition-all duration-300 relative ${isExpanded ? "w-60" : "w-[72px]"}`}>
      
      {/* Toggle Button */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        className="absolute -right-3 top-6 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white p-1 rounded-full z-10 transition-colors"
      >
        {isExpanded ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>

      {/* Logo */}
      <div className={`flex items-center ${isExpanded ? "gap-3 px-5 justify-start" : "justify-center px-0"} py-5 border-b border-zinc-800 h-20`}>
        <div className="flex items-center justify-center w-9 h-9 rounded-xl overflow-hidden bg-white shrink-0">
          <img src="/logo.png" alt="MiBx Logo" className="w-full h-full object-cover" />
        </div>
        {isExpanded && (
          <div className="whitespace-nowrap overflow-hidden">
            <p className="text-sm font-bold text-white leading-none">MiBx Dispatch v3</p>
            <p className="text-xs text-zinc-500 mt-0.5">ERP System</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-1 ${isExpanded ? "px-3" : "px-2"} py-4 space-y-2 overflow-y-auto overflow-x-hidden`}>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          let isActive = false;
          if (href === "/orders?status=delivered") {
            isActive = pathname === "/orders" && statusParam === "delivered";
          } else if (href === "/orders") {
            isActive = pathname === "/orders" && statusParam !== "delivered";
          } else {
            isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          }

          return (
            <Link
              key={href}
              href={href}
              title={!isExpanded ? label : undefined}
              className={`flex items-center ${isExpanded ? "gap-3 px-3 justify-start" : "justify-center px-0"} py-2.5 rounded-lg text-sm font-medium
                         transition-all duration-150 group whitespace-nowrap ${
                           isActive
                             ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/20"
                             : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent"
                         }`}
            >
              <Icon
                className={`w-4.5 h-4.5 shrink-0 ${
                  isActive ? "text-indigo-400" : "text-zinc-500 group-hover:text-zinc-300"
                }`}
                size={18}
              />
              {isExpanded && label}
              {isExpanded && label === "Orders" && (
                <span className="ml-auto text-xs bg-indigo-600/30 text-indigo-300 px-1.5 py-0.5 rounded-full font-medium">
                  Live
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Quick sync */}
      <div className={`px-2 pb-2`}>
        <button
          onClick={() => {
            fetch("/api/sync/shopify", { method: "POST" }).then(() => {
              window.location.reload();
            });
          }}
          title={!isExpanded ? "Sync Shopify Orders" : undefined}
          className={`w-full flex items-center ${isExpanded ? "gap-2 px-3 justify-start" : "justify-center px-0"} py-2.5 text-xs text-zinc-500
                     hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors whitespace-nowrap overflow-hidden`}
        >
          <Zap size={16} className="shrink-0" />
          {isExpanded && "Sync Shopify Orders"}
        </button>
      </div>

      {/* User section */}
      <div className="border-t border-zinc-800 p-2">
        <div className={`flex items-center ${isExpanded ? "gap-3 px-2" : "justify-center px-0"} py-2`}>
          <div className="w-9 h-9 rounded-full bg-indigo-600/20 border border-indigo-500/30
                         flex items-center justify-center text-sm font-bold text-indigo-400 shrink-0">
            {profile?.full_name?.[0]?.toUpperCase() || "U"}
          </div>
          {isExpanded && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-200 truncate">
                {profile?.full_name || "User"}
              </p>
              <p className="text-[10px] text-zinc-600 truncate capitalize mt-0.5">
                {profile?.role || "staff"}
              </p>
            </div>
          )}
          {isExpanded && (
            <a
              href="/api/auth/logout"
              className="text-zinc-600 hover:text-red-400 transition-colors shrink-0 ml-1"
              title="Sign out"
            >
              <LogOut size={16} />
            </a>
          )}
        </div>
        
        {/* Copyright */}
        {isExpanded && (
          <div className="px-2 pt-2 pb-1 text-center">
            <p className="text-[10px] text-zinc-600" suppressHydrationWarning>
              &copy; {new Date().getFullYear()} MiBx Dispatch.<br />
              Developed by Moinul Islam.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
