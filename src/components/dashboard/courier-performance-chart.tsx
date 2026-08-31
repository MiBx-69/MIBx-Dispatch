"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

type StatusCount = {
  status: string;
  count: number;
};

export function CourierPerformanceChart({ data }: { data: StatusCount[] }) {
  const chartData = [
    { name: "Pending", count: data.find(d => d.status === "Pending")?.count || 0, color: "#94a3b8" },
    { name: "In Transit", count: data.find(d => d.status === "In Transit")?.count || 0, color: "#3b82f6" },
    { name: "Delivered", count: data.find(d => d.status === "Delivered")?.count || 0, color: "#22c55e" },
    { name: "Returned", count: data.find(d => d.status === "Return")?.count || data.find(d => d.status === "Returned")?.count || 0, color: "#ef4444" },
  ];

  return (
    <div className="bg-card border rounded-lg p-6 w-full h-full">
      <h3 className="text-lg font-semibold mb-4">Courier Performance</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
            <Tooltip
              cursor={{ fill: 'transparent' }}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
