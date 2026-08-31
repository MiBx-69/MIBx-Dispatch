"use client";

import { useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function RevenueChart({ data }: { data: { date: string; displayDate?: string; revenue: number }[] }) {
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
                return (
                  <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg shadow-xl">
                    <p className="text-zinc-400 text-xs mb-1">{label}</p>
                    <p className="text-indigo-400 font-bold">
                      ৳{Number(payload[0].value).toLocaleString()}
                    </p>
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
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
