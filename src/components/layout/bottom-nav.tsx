"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  RotateCcw,
  Users,
  Settings,
  Wallet,
  BarChart,
  PackageCheck,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/dispatches", label: "Dispatches", icon: Truck },
  { href: "/orders?status=delivered", label: "Deliveries", icon: PackageCheck },
  { href: "/returns", label: "Returns", icon: RotateCcw },
  { href: "/reports", label: "Reports", icon: BarChart },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/finances", label: "Finances", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-900/95 backdrop-blur-lg
                    border-t border-zinc-800 mobile-safe-bottom">
      <div className="flex items-stretch justify-around px-1 pt-1 pb-1">
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
              className={`flex flex-col items-center justify-center gap-1 px-0.5 py-1 rounded-xl
                         transition-all duration-150 flex-1 shrink min-w-0 ${
                           isActive
                             ? "text-indigo-400"
                             : "text-zinc-500 active:text-zinc-300"
                         }`}
            >
              <div className={`p-1 rounded-lg transition-colors ${
                isActive ? "bg-indigo-600/20" : ""
              }`}>
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className="text-[9px] font-medium leading-none truncate w-full text-center">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
