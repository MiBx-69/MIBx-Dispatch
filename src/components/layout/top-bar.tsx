"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Bell, Zap, Truck } from "lucide-react";
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
  "/returns": "Returns",
};

interface TopBarProps {
  profile: Profile | null;
}

export function TopBar({ profile }: TopBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [syncing, setSyncing] = useState(false);
  const [syncingCourier, setSyncingCourier] = useState(false);

  let title = PAGE_TITLES[pathname] || "MiBx Dispatch v3";
  if (pathname === "/orders" && searchParams.get("status") === "delivered") {
    title = "Deliveries";
  }

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

  const handleCourierSync = async () => {
    setSyncingCourier(true);
    const toastId = toast.loading("Scanning active pending courier parcels with Pathao...");
    try {
      const res = await fetch(`/api/pathao/sync-status`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Courier sync failed");
      toast.success(`Pending Courier Sync Complete!`, {
        id: toastId,
        description: `Checked ${data.checked || data.totalChecked || 0} active parcels in ${data.durationMs ? (data.durationMs / 1000).toFixed(1) + 's' : 'seconds'}. Updated ${data.updated || data.updatedCount || 0} orders.`,
        duration: 5000,
      });
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || "Failed to scan courier", { id: toastId });
    } finally {
      setSyncingCourier(false);
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
        {/* Sync Pending Courier Button */}
        <button
          onClick={handleCourierSync}
          disabled={syncingCourier}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 transition-colors disabled:opacity-50"
          title="Quick sync pending & in-transit parcels with Pathao"
        >
          <Truck size={13} className={syncingCourier ? "animate-bounce text-amber-400" : "text-amber-400"} />
          <span className="hidden sm:inline">{syncingCourier ? "Syncing..." : "Sync Pending"}</span>
        </button>

        {/* Sync Shopify button */}
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
