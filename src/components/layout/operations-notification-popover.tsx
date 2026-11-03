"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  ShieldAlert,
  AlertCircle,
  Truck,
  Clock,
  ExternalLink,
  RotateCw,
  X,
  CheckCircle,
} from "lucide-react";

interface NotificationItem {
  id: string;
  category: "high_risk" | "stale_pending" | "courier_exception" | "follow_up";
  title: string;
  description: string;
  timestamp: string;
  actionUrl: string;
  severity: "critical" | "warning" | "info";
}

export function OperationsNotificationPopover() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const popoverRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications");
      const data = await res.json();
      if (Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Poll notifications every 90 seconds
    const interval = setInterval(fetchNotifications, 90_000);
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filteredNotifications =
    filter === "all"
      ? notifications
      : notifications.filter((n) => n.category === filter);

  const totalCount = notifications.length;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
        title="Operations Alert Center"
        aria-label="Open notifications"
      >
        <Bell size={16} />
        {totalCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-100">Operations Alerts</span>
              {totalCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  {totalCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchNotifications}
                disabled={loading}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                title="Refresh alerts"
              >
                <RotateCw size={13} className={loading ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-zinc-800/50 bg-zinc-900/20 overflow-x-auto scrollbar-hide text-[11px]">
            {[
              { label: "All", value: "all" },
              { label: "Risk", value: "high_risk" },
              { label: "Pending >48h", value: "stale_pending" },
              { label: "Courier", value: "courier_exception" },
              { label: "Follow-up", value: "follow_up" },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-2.5 py-0.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  filter === f.value
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Alerts List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-zinc-800/40 p-1">
            {filteredNotifications.length === 0 ? (
              <div className="py-8 text-center text-zinc-500 text-xs flex flex-col items-center justify-center space-y-1.5">
                <CheckCircle size={24} className="text-emerald-500/60" />
                <span>All clear! No urgent operations alerts.</span>
              </div>
            ) : (
              filteredNotifications.map((n) => {
                const icon =
                  n.category === "high_risk" ? (
                    <ShieldAlert size={14} className="text-rose-400 shrink-0" />
                  ) : n.category === "stale_pending" ? (
                    <AlertCircle size={14} className="text-amber-400 shrink-0" />
                  ) : n.category === "courier_exception" ? (
                    <Truck size={14} className="text-orange-400 shrink-0" />
                  ) : (
                    <Clock size={14} className="text-indigo-400 shrink-0" />
                  );

                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      setOpen(false);
                      router.push(n.actionUrl);
                    }}
                    className="p-2.5 rounded-xl hover:bg-zinc-900/80 cursor-pointer transition-colors flex items-start gap-2.5 text-left"
                  >
                    <div className="mt-0.5 p-1 rounded-lg bg-zinc-900 border border-zinc-800">
                      {icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-zinc-200 truncate">
                          {n.title}
                        </span>
                        <ExternalLink size={10} className="text-zinc-500 shrink-0" />
                      </div>
                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">{n.description}</p>
                      <span className="text-[10px] text-zinc-500 mt-1 block">
                        {new Date(n.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
