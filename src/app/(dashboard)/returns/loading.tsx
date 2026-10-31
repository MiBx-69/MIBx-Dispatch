export default function ReturnsLoading() {
  return (
    <div className="w-full flex flex-col space-y-4 animate-pulse p-3 sm:p-6 pb-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="space-y-2">
          <div className="h-7 bg-zinc-800 rounded-lg w-32"></div>
          <div className="h-4 bg-zinc-800/60 rounded-md w-52"></div>
        </div>
      </div>

      {/* Return KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-zinc-900 border border-zinc-800 rounded-2xl p-4"></div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <div className="h-8 bg-zinc-800 rounded-xl w-32"></div>
        <div className="h-8 bg-zinc-800/60 rounded-xl w-32"></div>
      </div>

      {/* Rows */}
      <div className="space-y-2.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 bg-zinc-900 border border-zinc-800 rounded-2xl w-full"></div>
        ))}
      </div>
    </div>
  );
}

