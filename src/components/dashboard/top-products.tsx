"use client";

export function TopProducts({ products }: { products: { id: string, title: string, variant: string, qty: number, revenue: number }[] }) {
  if (!products || products.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-sm py-10">
        No products sold in this period.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {products.map((p, i) => (
        <div key={p.id} className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded bg-zinc-800 border border-zinc-700/50 flex items-center justify-center shrink-0 text-zinc-400 font-mono text-xs">
              #{i + 1}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-200 truncate pr-2">{p.title}</p>
              {p.variant && <p className="text-xs text-zinc-500 truncate">{p.variant}</p>}
            </div>
          </div>
          <div className="text-right shrink-0 pl-4">
            <p className="text-sm font-bold text-emerald-400">৳{p.revenue.toLocaleString()}</p>
            <p className="text-xs text-zinc-500">{p.qty} sold</p>
          </div>
        </div>
      ))}
    </div>
  );
}
