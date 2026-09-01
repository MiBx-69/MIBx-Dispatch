"use client";

import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function RevenueChart({ data }: { data: { date: string; displayDate?: string; revenue: number; subtotal?: number }[] }) {
  const formattedData = data;

  if (!data || data.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-sm">
        No revenue data for this period.
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formattedData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorSubtotal" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis 
            dataKey="displayDate" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#71717a' }} 
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#71717a' }}
            tickFormatter={(value) => `৳${value >= 1000 ? (value / 1000).toFixed(1) + 'k' : value}`}
          />
          <Tooltip 
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const total = payload.find(p => p.dataKey === 'revenue')?.value || 0;
                const subtotal = payload.find(p => p.dataKey === 'subtotal')?.value || 0;
                return (
                  <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg shadow-xl">
                    <p className="text-zinc-400 text-xs mb-2">{label}</p>
                    <div className="flex justify-between gap-4 mb-1">
                      <span className="text-indigo-400 font-medium text-xs">w/ Delivery</span>
                      <span className="text-indigo-400 font-bold">৳{Number(total).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-emerald-400 font-medium text-xs">w/o Delivery</span>
                      <span className="text-emerald-400 font-bold">৳{Number(subtotal).toLocaleString()}</span>
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
            fill="url(#colorRevenue)" 
            name="w/ Delivery"
          />
          <Area 
            type="monotone" 
            dataKey="subtotal" 
            stroke="#10b981" 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorSubtotal)" 
            name="w/o Delivery"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
