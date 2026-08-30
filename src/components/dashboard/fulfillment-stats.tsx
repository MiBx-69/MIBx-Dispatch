"use client";

export function FulfillmentStats({ 
  stats 
}: { 
  stats: {
    unfulfilled: number;
    partial: number;
    fulfilled: number;
    paid: number;
    pending_payment: number;
    total: number;
  } 
}) {
  const { unfulfilled, partial, fulfilled, paid, pending_payment, total } = stats;
  
  if (total === 0) return null;

  const getPercent = (val: number) => total > 0 ? (val / total) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Fulfillment */}
      <div>
        <div className="flex items-center justify-between text-xs font-semibold mb-2">
          <span className="text-zinc-400 uppercase tracking-wider">Fulfillment</span>
          <span className="text-zinc-500">{total} orders</span>
        </div>
        
        <div className="h-2 flex rounded-full overflow-hidden bg-zinc-800">
          <div style={{ width: `${getPercent(fulfilled)}%` }} className="bg-emerald-500 transition-all duration-1000" title={`Fulfilled: ${fulfilled}`} />
          <div style={{ width: `${getPercent(partial)}%` }} className="bg-amber-500 transition-all duration-1000" title={`Partial: ${partial}`} />
          <div style={{ width: `${getPercent(unfulfilled)}%` }} className="bg-zinc-600 transition-all duration-1000" title={`Unfulfilled: ${unfulfilled}`} />
        </div>
        
        <div className="flex gap-4 mt-3 text-[10px] text-zinc-500">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Fulfilled ({fulfilled})</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" /> Partial ({partial})</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-zinc-600" /> Unfulfilled ({unfulfilled})</div>
        </div>
      </div>

      {/* Payment */}
      <div>
        <div className="flex items-center justify-between text-xs font-semibold mb-2">
          <span className="text-zinc-400 uppercase tracking-wider">Payment</span>
        </div>
        
        <div className="h-2 flex rounded-full overflow-hidden bg-zinc-800">
          <div style={{ width: `${getPercent(paid)}%` }} className="bg-indigo-500 transition-all duration-1000" title={`Paid: ${paid}`} />
          <div style={{ width: `${getPercent(pending_payment)}%` }} className="bg-orange-500 transition-all duration-1000" title={`Pending: ${pending_payment}`} />
        </div>
        
        <div className="flex gap-4 mt-3 text-[10px] text-zinc-500">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Paid ({paid})</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /> Pending ({pending_payment})</div>
        </div>
      </div>
    </div>
  );
}
