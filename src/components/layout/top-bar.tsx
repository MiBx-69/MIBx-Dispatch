"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Bell, Zap, Truck, ChevronDown } from "lucide-react";
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

  const [courierDropdownOpen, setCourierDropdownOpen] = useState(false);

  const handleCourierSync = async (days: number | "all" = 7) => {
    setCourierDropdownOpen(false);
    setSyncingCourier(true);
    const toastId = toast.loading(
      days === "all"
        ? "Scanning all Pathao courier dispatches (Full History)..."
        : "Scanning courier orders for the last 7 days..."
    );
    try {
      const res = await fetch(`/api/pathao/sync-status?days=${days}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Courier sync failed");
      toast.success(`Courier Scan Complete!`, {
        id: toastId,
        description: `Checked ${data.checked || data.totalChecked} parcels (${days === "all" ? "All History" : "Last 7 Days"}). Updated ${data.updated || data.updatedCount} orders.`,
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
        {/* Sync Courier (7 Days or All) Dropdown Button */}
        <div className="relative flex items-center">
          <button
            onClick={() => handleCourierSync(7)}
            disabled={syncingCourier}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-lg text-xs font-medium
                       text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 transition-colors disabled:opacity-50"
            title="Scan Pathao courier status for all orders from the last 7 days"
          >
            <Truck size={13} className={syncingCourier ? "animate-bounce text-amber-400" : "text-amber-400"} />
            <span className="hidden sm:inline">{syncingCourier ? "Scanning..." : "Sync Courier (7d)"}</span>
          </button>
          <button
            type="button"
            onClick={() => setCourierDropdownOpen(!courierDropdownOpen)}
            disabled={syncingCourier}
            className="px-1.5 py-1.5 rounded-r-lg text-xs font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border-t border-r border-b border-l-0 border-amber-500/25 transition-colors disabled:opacity-50"
            title="Options: 7 Days or Complete Scan"
          >
            <ChevronDown size={12} />
          </button>

          {courierDropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-60 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95">
              <div className="px-2.5 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Courier Scan Range
              </div>
              <button
                type="button"
                onClick={() => handleCourierSync(7)}
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <div className="font-medium text-amber-400">Scan Last 7 Days (Default)</div>
                <div className="text-[10px] text-zinc-400">Quick scan of all recent orders</div>
              </button>
              <button
                type="button"
                onClick={() => handleCourierSync("all")}
                className="w-full text-left px-2.5 py-2 rounded-lg text-xs text-zinc-200 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <div className="font-medium text-indigo-400">Complete Scan (All Dispatches)</div>
                <div className="text-[10px] text-zinc-400">Scan all past orders on Pathao</div>
              </button>
            </div>
          )}
        </div>

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
