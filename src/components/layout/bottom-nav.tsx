"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Users,
  Settings,
  Wallet,
  BarChart,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/orders", label: "Orders", icon: ShoppingCart },
  { href: "/dispatches", label: "Dispatches", icon: Truck },
  { href: "/reports", label: "Reports", icon: BarChart },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/finances", label: "Finances", icon: Wallet },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-zinc-900/95 backdrop-blur-lg
                    border-t border-zinc-800 mobile-safe-bottom">
      <div className="flex items-stretch justify-around px-2 pt-2">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/" ? pathname === "/" : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl
                         transition-all duration-150 min-w-0 flex-1 ${
                           isActive
                             ? "text-indigo-400"
                             : "text-zinc-600 active:text-zinc-400"
                         }`}
            >
              <div className={`p-1.5 rounded-lg transition-colors ${
                isActive ? "bg-indigo-600/20" : ""
              }`}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className="text-[10px] font-medium leading-none truncate">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
