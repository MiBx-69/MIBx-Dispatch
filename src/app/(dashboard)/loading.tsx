import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="w-full h-full flex flex-col space-y-6 animate-pulse p-4 sm:p-6">
      {/* Header Skeleton */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="space-y-2 w-1/3">
          <div className="h-8 bg-zinc-800 rounded-lg w-full max-w-[200px]"></div>
          <div className="h-4 bg-zinc-800 rounded-lg w-full max-w-[300px]"></div>
        </div>
        <div className="h-10 bg-zinc-800 rounded-xl w-full sm:w-32"></div>
      </div>

      {/* Stats Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-zinc-800/50 border border-zinc-800 rounded-2xl p-4 h-24"></div>
        ))}
      </div>

      {/* Filters Skeleton */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4">
        <div className="h-10 bg-zinc-800 rounded-xl w-full sm:w-1/3"></div>
        <div className="h-10 bg-zinc-800 rounded-xl w-full sm:w-1/4"></div>
      </div>

      {/* List Skeleton */}
      <div className="space-y-3 pt-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 bg-zinc-800/50 border border-zinc-800 rounded-2xl w-full"></div>
        ))}
      </div>
    </div>
  );
}
