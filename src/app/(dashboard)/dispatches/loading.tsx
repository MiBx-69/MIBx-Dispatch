export default function DispatchesLoading() {
  return (
    <div className="w-full flex flex-col space-y-4 animate-pulse p-3 sm:p-6 pb-24">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="space-y-2">
          <div className="h-7 bg-zinc-800 rounded-lg w-40"></div>
          <div className="h-4 bg-zinc-800/60 rounded-md w-60"></div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <div className="h-9 bg-zinc-800 rounded-xl w-32"></div>
        </div>
      </div>

      {/* Telemetry Strip Skeleton */}
      <div className="h-28 bg-zinc-900/90 border border-zinc-800 rounded-2xl w-full"></div>

      {/* Filter Tabs Skeleton */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-8 bg-zinc-800/80 rounded-xl w-24 shrink-0"></div>
        ))}
      </div>

      {/* Dispatch Cards / Rows Skeleton */}
      <div className="space-y-2.5 pt-1">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-20 bg-zinc-900/80 border border-zinc-800/80 rounded-2xl w-full p-4 flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 bg-zinc-800 rounded w-36"></div>
              <div className="h-3 bg-zinc-800/60 rounded w-48"></div>
            </div>
            <div className="h-6 bg-zinc-800/60 rounded-full w-24"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

