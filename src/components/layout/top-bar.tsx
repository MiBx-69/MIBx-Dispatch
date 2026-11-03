"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Zap, Truck, ScanBarcode } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { Profile } from "@/types/database";
import { PackScanModal } from "@/components/orders/pack-scan-modal";
import { OperationsNotificationPopover } from "@/components/layout/operations-notification-popover";

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
  "/inventory": "Inventory Overview",
  "/inventory/stock-in": "Stock In Entry",
  "/inventory/stock-out": "Stock Out Entry",
  "/inventory/history": "Stock Ledger & History",
  "/inventory/categories": "Source Categories",
};

interface TopBarProps {
  profile: Profile | null;
}

export function TopBar({ profile }: TopBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [syncing, setSyncing] = useState(false);
  const [syncingCourier, setSyncingCourier] = useState(false);
  const [packModalOpen, setPackModalOpen] = useState(false);

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
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Scan & Pack Button */}
        <button
          onClick={() => setPackModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold
                     text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 transition-all duration-200 active:scale-95"
          title="Warehouse Barcode Scan & Pack Verification"
        >
          <ScanBarcode size={14} className="text-emerald-400 shrink-0" />
          <span className="hidden sm:inline">Scan & Pack</span>
        </button>

        {/* Sync Pending Courier Button */}
        <button
          onClick={handleCourierSync}
          disabled={syncingCourier}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium
                     text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          title="Quick sync pending & in-transit parcels with Pathao"
        >
          <Truck size={13} className={syncingCourier ? "animate-bounce text-amber-400" : "text-amber-400"} />
          <span className="hidden md:inline">{syncingCourier ? "Syncing..." : "Sync Pending"}</span>
        </button>

        {/* Sync Shopify button */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                     text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-transparent hover:border-zinc-700/50 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          title="Sync Shopify orders"
        >
          <Zap size={13} className={syncing ? "animate-pulse text-indigo-400" : ""} />
          <span>{syncing ? "Syncing..." : "Sync"}</span>
        </button>

        {/* Operations Alerts Bell */}
        <OperationsNotificationPopover />

        {/* User avatar */}
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-600/20
                        border border-indigo-500/30 text-xs font-bold text-indigo-400 shrink-0">
          {profile?.full_name?.[0]?.toUpperCase() || "U"}
        </div>
      </div>

      {/* Warehouse Scan & Pack Verification Modal */}
      <PackScanModal
        open={packModalOpen}
        onClose={() => setPackModalOpen(false)}
      />
    </header>
  );
}
