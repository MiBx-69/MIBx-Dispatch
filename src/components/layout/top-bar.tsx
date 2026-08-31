"use client";

import { usePathname } from "next/navigation";
import { Bell, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Profile } from "@/types/database";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/orders": "Orders",
  "/dispatches": "Dispatches",
  "/customers": "Customers",
  "/settings": "Settings",
  "/settings/shopify": "Shopify Settings",
  "/settings/pathao": "Pathao Settings",
  "/settings/account": "Account",
  "/settings/webhooks": "Webhooks",
};

interface TopBarProps {
  profile: Profile | null;
}

export function TopBar({ profile }: TopBarProps) {
  const pathname = usePathname();
  const [syncing, setSyncing] = useState(false);

  const title = PAGE_TITLES[pathname] || "MiBx Dispatch v3";

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/sync/shopify", { method: "POST" });
      const data = await res.json();
      toast.success("Shopify sync started!", {
        description: "Orders will appear shortly",
      });
    } catch {
      toast.error("Sync failed. Check settings.");
    } finally {
      setTimeout(() => setSyncing(false), 3000);
    }
  };

  return (
    <header className="flex items-center justify-between gap-4 px-4 py-3 border-b border-zinc-800
                       bg-zinc-900/50 backdrop-blur-sm shrink-0 lg:px-6">
      {/* Title */}
      <div className="flex items-center gap-3">
        {/* Mobile logo */}
        <div className="flex items-center justify-center w-8 h-8 rounded-lg overflow-hidden bg-white shrink-0 lg:hidden">
          <img src="/logo.png" alt="MiBx Logo" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-base font-semibold text-zinc-100">{title}</h1>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50"
          title="Sync Shopify orders"
        >
          <Zap size={13} className={syncing ? "animate-pulse text-indigo-400" : ""} />
          <span className="hidden md:inline">{syncing ? "Syncing..." : "Sync"}</span>
        </button>

        {/* User avatar */}
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600/20
                        border border-indigo-500/30 text-xs font-bold text-indigo-400 shrink-0">
          {profile?.full_name?.[0]?.toUpperCase() || "U"}
        </div>
      </div>
    </header>
  );
}
