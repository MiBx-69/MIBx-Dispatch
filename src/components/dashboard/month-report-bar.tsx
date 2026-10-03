"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Check, Sparkles, Loader2 } from "lucide-react";
import { getAvailableMonths, getBstToday, findMatchingMonth, type MonthInfo } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface MonthReportBarProps {
  startDate: string;
  endDate: string;
  filterType: string;
  isPending: boolean;
  onSelectMonth: (month: MonthInfo) => void;
  onSelectYearToDate?: (year: number) => void;
}

export function MonthReportBar({
  startDate,
  endDate,
  filterType,
  isPending,
  onSelectMonth,
  onSelectYearToDate,
}: MonthReportBarProps) {
  const { year: bstCurrentYear, month: bstCurrentMonth } = getBstToday();
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    // If startDate has a year, default to that year
    const match = startDate?.match(/^(\d{4})/);
    return match ? parseInt(match[1]) : bstCurrentYear;
  });

  const months = getAvailableMonths(selectedYear);
  const matchedMonth = findMatchingMonth(startDate, endDate);

  // If the active date range matches a month in this or another year
  const isSelectedYearCurrent = selectedYear === bstCurrentYear;

  // Filter months to show:
  // For current year: January to Current Month (as requested by user), or all 12
  // Let's show January to current month prominently, with future months in a subtle secondary state
  const visibleMonths = isSelectedYearCurrent
    ? months.slice(0, bstCurrentMonth)
    : months;

  const handlePrevYear = () => {
    setSelectedYear((prev) => prev - 1);
  };

  const handleNextYear = () => {
    if (selectedYear < bstCurrentYear) {
      setSelectedYear((prev) => prev + 1);
    }
  };

  const isMonthActive = (m: MonthInfo) => {
    if (matchedMonth) {
      return matchedMonth.year === m.year && matchedMonth.month === m.month;
    }
    return startDate === m.startDate && endDate === m.endDate;
  };

  return (
    <div className="bg-gradient-to-b from-zinc-900/95 to-zinc-950/95 border border-zinc-800/80 p-3 sm:p-3.5 rounded-2xl shadow-sm space-y-2.5">
      {/* ── Top Bar: Title, Year Navigator, Active Indicator ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <CalendarDays className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-white tracking-tight">Month-Wise Reports</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-300 font-medium">
                {isSelectedYearCurrent ? `Jan → ${months[bstCurrentMonth - 1]?.shortName || "Now"}` : `Full Year ${selectedYear}`}
              </span>
            </div>
          </div>
        </div>

        {/* ── Year Controls & Quick Shortcuts ── */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Year Switcher */}
          <div className="flex items-center bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-0.5">
            <button
              type="button"
              onClick={handlePrevYear}
              disabled={isPending}
              title={`Previous Year (${selectedYear - 1})`}
              className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-40"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-xs font-bold text-zinc-200 min-w-[42px] text-center">
              {selectedYear}
            </span>
            <button
              type="button"
              onClick={handleNextYear}
              disabled={selectedYear >= bstCurrentYear || isPending}
              title={`Next Year (${selectedYear + 1})`}
              className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-20 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Year-To-Date (YTD) button if current year */}
          {onSelectYearToDate && isSelectedYearCurrent && (
            <button
              type="button"
              onClick={() => onSelectYearToDate(selectedYear)}
              disabled={isPending}
              className={cn(
                "px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border",
                startDate === `${selectedYear}-01-01` && (endDate === `${selectedYear}-${String(bstCurrentMonth).padStart(2, "0")}-${String(new Date(Date.UTC(selectedYear, bstCurrentMonth, 0)).getUTCDate()).padStart(2, "0")}` || endDate === `${selectedYear}-${String(bstCurrentMonth).padStart(2, "0")}-${String(getBstToday().day).padStart(2, "0")}`)
                  ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                  : "bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-800"
              )}
            >
              YTD ({selectedYear})
            </button>
          )}
        </div>
      </div>

      {/* ── Month Pills Bar ── */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar scroll-smooth">
        {visibleMonths.map((m) => {
          const active = isMonthActive(m);
          return (
            <button
              key={`${m.year}-${m.month}`}
              type="button"
              onClick={() => onSelectMonth(m)}
              disabled={isPending}
              className={cn(
                "relative group flex-1 min-w-[54px] sm:min-w-[62px] py-1.5 px-2 rounded-xl text-xs font-medium transition-all duration-150 flex flex-col items-center justify-center border",
                active
                  ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white font-semibold shadow-md shadow-indigo-500/25 border-indigo-400/50 scale-[1.02]"
                  : "bg-zinc-950/60 hover:bg-zinc-800/90 text-zinc-300 hover:text-white border-zinc-800/80 hover:border-zinc-700/80"
              )}
            >
              <div className="flex items-center gap-1">
                <span>{m.shortName}</span>
                {active && isPending ? (
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                ) : active ? (
                  <Check className="w-2.5 h-2.5 text-white/90" />
                ) : null}
              </div>

              {/* Sub-label for current month */}
              {m.isCurrent && (
                <span
                  className={cn(
                    "text-[9px] font-bold tracking-tight mt-0.5",
                    active ? "text-indigo-100" : "text-emerald-400"
                  )}
                >
                  Current
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Active Status Hint ── */}
      <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/40">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
          {matchedMonth ? (
            <span>
              Viewing <strong className="text-zinc-200">{matchedMonth.name} {matchedMonth.year}</strong> report ({matchedMonth.startDate} to {matchedMonth.endDate})
            </span>
          ) : (
            <span>
              Custom period active: <strong className="text-zinc-200">{startDate} → {endDate}</strong> · Click any month above to view its complete report
            </span>
          )}
        </div>
        {matchedMonth && (
          <span className="text-zinc-500 text-[10px] hidden sm:inline">
            Includes all orders, Pathao collections, dispatches & returns for this month
          </span>
        )}
      </div>
    </div>
  );
}
