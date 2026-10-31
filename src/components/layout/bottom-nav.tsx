"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  RotateCcw,
  MoreHorizontal,
  PackageCheck,
  Boxes,
  BarChart,
  Wallet,
  Users,
  Settings,
  FileText,
  X,
} from "lucide-react";

const PRIMARY_NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/dispatches", label: "Dispatch", icon: Truck },
  { href: "/returns", label: "Returns", icon: RotateCcw },
];

const MORE_NAV = [
  { href: "/orders?status=delivered", label: "Deliveries", icon: PackageCheck, desc: "Delivered parcels & tracking" },
  { href: "/inventory", label: "Stock Inventory", icon: Boxes, desc: "Stock-in, stock-out & logs" },
  { href: "/reports", label: "Reports & Closings", icon: BarChart, desc: "Daily & monthly sales closings" },
  { href: "/finances", label: "Finances & Ledger", icon: Wallet, desc: "Expense and receipt tracking" },
  { href: "/customers", label: "Customers", icon: Users, desc: "Customer order history & risk" },
  { href: "/logs", label: "Audit & Webhooks", icon: FileText, desc: "Webhook logs and retry center" },
  { href: "/settings", label: "Settings", icon: Settings, desc: "Shopify, Pathao & SMS configs" },
];

export function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const [showMore, setShowMore] = useState(false);

  const isMoreActive = MORE_NAV.some(({ href }) => {
    if (href === "/orders?status=delivered") {
      return pathname === "/orders" && statusParam === "delivered";
    }
    return href === "/" ? pathname === "/" : pathname.startsWith(href.split("?")[0]);
  });

  return (
    <>
      {/* Slide-up "More" Drawer for Mobile */}
      {showMore && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowMore(false)}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-4 space-y-3 max-h-[80vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)] animate-in slide-in-from-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div>
                <h3 className="text-sm font-bold text-white">More Modules</h3>
                <p className="text-[11px] text-zinc-400">Inventory, reporting, finances & settings</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMore(false)}
                className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {MORE_NAV.map(({ href, label, icon: Icon, desc }) => {
                let isActive = false;
                if (href === "/orders?status=delivered") {
                  isActive = pathname === "/orders" && statusParam === "delivered";
                } else {
                  isActive = pathname.startsWith(href.split("?")[0]);
                }

                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setShowMore(false)}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      isActive
                        ? "bg-indigo-600/15 border-indigo-500/30 text-white"
                        : "bg-zinc-950/70 border-zinc-800/80 text-zinc-300 hover:bg-zinc-800/50"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isActive
                          ? "bg-indigo-600 text-white"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-tight">{label}</p>
                      <p className="text-[10px] text-zinc-500 truncate mt-0.5">{desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Bottom Nav Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-zinc-900/95 backdrop-blur-lg border-t border-zinc-800/90 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-stretch justify-around px-2 py-1.5 h-16">
          {PRIMARY_NAV.map(({ href, label, icon: Icon }) => {
            let isActive = false;
            if (href === "/orders") {
              isActive = pathname === "/orders" && statusParam !== "delivered";
            } else {
              isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
            }

            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center justify-center gap-1 py-1 rounded-xl transition-all flex-1 min-w-0 ${
                  isActive
                    ? "text-indigo-400 font-semibold"
                    : "text-zinc-400 active:text-zinc-200"
                }`}
              >
                <div
                  className={`p-1.5 rounded-xl transition-colors ${
                    isActive ? "bg-indigo-600/20 text-indigo-400" : ""
                  }`}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className="text-[10px] leading-none truncate">{label}</span>
              </Link>
            );
          })}

          {/* 5th Button: More */}
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className={`flex flex-col items-center justify-center gap-1 py-1 rounded-xl transition-all flex-1 min-w-0 ${
              isMoreActive || showMore
                ? "text-indigo-400 font-semibold"
                : "text-zinc-400 active:text-zinc-200"
            }`}
          >
            <div
              className={`p-1.5 rounded-xl transition-colors ${
                isMoreActive || showMore ? "bg-indigo-600/20 text-indigo-400" : ""
              }`}
            >
              <MoreHorizontal size={20} strokeWidth={isMoreActive ? 2.5 : 2} />
            </div>
            <span className="text-[10px] leading-none truncate">More</span>
          </button>
        </div>
      </nav>
    </>
  );
}
