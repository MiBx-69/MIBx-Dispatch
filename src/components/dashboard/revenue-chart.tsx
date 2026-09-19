"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function RevenueChart({
  data,
}: {
  data: { date: string; displayDate?: string; revenue: number; subtotal?: number }[];
}) {
  if (!data || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
        No revenue data for this period.
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 4, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradSubtotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="displayDate"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#52525b" }}
            dy={8}
            interval="preserveStartEnd"
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "#52525b" }}
            tickFormatter={(v) =>
              `৳${v >= 1000 ? (v / 1000).toFixed(0) + "k" : v}`
            }
            width={52}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const total = payload.find((p) => p.dataKey === "revenue")?.value || 0;
                const subtotal = payload.find((p) => p.dataKey === "subtotal")?.value || 0;
                return (
                  <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl shadow-2xl text-xs">
                    <p className="text-zinc-400 mb-2 font-medium">{label}</p>
                    <div className="space-y-1">
                      <div className="flex justify-between gap-6">
                        <span className="text-indigo-400">w/ Delivery</span>
                        <span className="text-white font-bold">৳{Number(total).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-emerald-400">w/o Delivery</span>
                        <span className="text-white font-bold">৳{Number(subtotal).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#818cf8"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#gradRevenue)"
            dot={false}
            activeDot={{ r: 4, fill: "#818cf8", strokeWidth: 0 }}
          />
          <Area
            type="monotone"
            dataKey="subtotal"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#gradSubtotal)"
            dot={false}
            activeDot={{ r: 4, fill: "#10b981", strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
