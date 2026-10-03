/**
 * Shared date utility functions — safe to import in both Server and Client components.
 * No server-side imports (no next/headers, no supabase/server).
 */

/**
 * Returns current year, month (1-indexed), and day in Bangladesh Time (+06:00).
 */
export function getBstToday(): { year: number; month: number; day: number } {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = dtf.formatToParts(now);
  return {
    year: parseInt(parts.find((p) => p.type === "year")!.value),
    month: parseInt(parts.find((p) => p.type === "month")!.value), // 1-indexed
    day: parseInt(parts.find((p) => p.type === "day")!.value),
  };
}

/**
 * Formats a Date or ISO string to YYYY-MM-DD in Bangladesh Time (Asia/Dhaka, +06:00).
 */
export function formatBstDate(date: Date | string): string {
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return dtf.format(d);
  } catch {
    return typeof date === "string" ? date.split("T")[0] : "";
  }
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
] as const;

export const MONTH_SHORT_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
] as const;

export interface MonthInfo {
  month: number; // 1-indexed (1 = Jan, 12 = Dec)
  year: number;
  name: string;
  shortName: string;
  startDate: string; // YYYY-MM-01
  endDate: string; // YYYY-MM-lastDay
  isCurrent: boolean;
  isFuture: boolean;
}

/**
 * Returns startDate (YYYY-MM-01) and endDate (YYYY-MM-lastDay) for any year and month (1-12).
 */
export function getMonthRange(year: number, month: number): { startDate: string; endDate: string } {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    startDate: `${year}-${pad(month)}-01`,
    endDate: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/**
 * Returns the list of months for a given year.
 */
export function getAvailableMonths(targetYear?: number): MonthInfo[] {
  const { year: currentYear, month: currentMonth } = getBstToday();
  const year = targetYear || currentYear;
  const isCurrentYear = year === currentYear;

  const months: MonthInfo[] = [];
  for (let m = 1; m <= 12; m++) {
    const range = getMonthRange(year, m);
    const isCurrent = isCurrentYear && m === currentMonth;
    const isFuture = year > currentYear || (isCurrentYear && m > currentMonth);
    months.push({
      month: m,
      year,
      name: MONTH_NAMES[m - 1],
      shortName: MONTH_SHORT_NAMES[m - 1],
      startDate: range.startDate,
      endDate: range.endDate,
      isCurrent,
      isFuture,
    });
  }
  return months;
}

/**
 * Checks if a given startDate and endDate correspond to a full calendar month.
 */
export function findMatchingMonth(startDate: string, endDate: string): MonthInfo | null {
  if (!startDate || !endDate) return null;
  const match = startDate.match(/^(\d{4})-(\d{2})-01$/);
  if (!match) return null;
  const year = parseInt(match[1]);
  const month = parseInt(match[2]);
  if (month < 1 || month > 12) return null;
  const expectedRange = getMonthRange(year, month);
  if (expectedRange.startDate === startDate && expectedRange.endDate === endDate) {
    const { year: currYear, month: currMonth } = getBstToday();
    return {
      month,
      year,
      name: MONTH_NAMES[month - 1],
      shortName: MONTH_SHORT_NAMES[month - 1],
      startDate,
      endDate,
      isCurrent: year === currYear && month === currMonth,
      isFuture: year > currYear || (year === currYear && month > currMonth),
    };
  }
  return null;
}

/**
 * Resolves a named date filter to ISO start/end strings (UTC) adjusted for BST (+06:00).
 */
export function resolveDateRange(
  dateFilter?: string,
  customStart?: string,
  customEnd?: string
): { startDateStr: string | null; endDateStr: string | null } {
  if (dateFilter === "all") {
    return { startDateStr: null, endDateStr: null };
  }

  // Handle custom range if dates are provided or dateFilter is custom
  if (dateFilter === "custom" || (!dateFilter && customStart && customEnd)) {
    if (customStart && customEnd) {
      let rawStart = customStart.trim();
      let rawEnd = customEnd.trim();
      if (rawStart > rawEnd) {
        const temp = rawStart;
        rawStart = rawEnd;
        rawEnd = temp;
      }

      const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
      let startStr = isDateOnly(rawStart)
        ? new Date(`${rawStart}T00:00:00.000+06:00`).toISOString()
        : new Date(rawStart).toISOString();
      let endStr = isDateOnly(rawEnd)
        ? new Date(`${rawEnd}T23:59:59.999+06:00`).toISOString()
        : new Date(rawEnd).toISOString();

      // Ensure chronological order
      if (new Date(startStr) > new Date(endStr)) {
        const temp = startStr;
        startStr = endStr;
        endStr = temp;
      }
      return { startDateStr: startStr, endDateStr: endStr };
    }
  }

  const effectiveFilter = dateFilter || "last_30_days";
  const { year, month, day } = getBstToday();

  const getBstIso = (y: number, m: number, d: number, endOfDay = false) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const timeStr = endOfDay ? "23:59:59.999+06:00" : "00:00:00.000+06:00";
    return new Date(`${y}-${pad(m)}-${pad(d)}T${timeStr}`).toISOString();
  };

  let startDateStr: string;
  let endDateStr: string;

  if (effectiveFilter === "today") {
    startDateStr = getBstIso(year, month, day, false);
    endDateStr = getBstIso(year, month, day, true);
  } else if (effectiveFilter === "yesterday") {
    const yDate = new Date(Date.UTC(year, month - 1, day - 1));
    startDateStr = getBstIso(yDate.getUTCFullYear(), yDate.getUTCMonth() + 1, yDate.getUTCDate(), false);
    endDateStr = getBstIso(yDate.getUTCFullYear(), yDate.getUTCMonth() + 1, yDate.getUTCDate(), true);
  } else if (effectiveFilter === "this_week") {
    const nowBst = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = nowBst.getUTCDay(); // 0 is Sunday
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday start
    const monday = new Date(Date.UTC(year, month - 1, day + diff));
    startDateStr = getBstIso(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), false);
    endDateStr = getBstIso(year, month, day, true);
  } else if (effectiveFilter === "last_7_days") {
    const sDate = new Date(Date.UTC(year, month - 1, day - 6));
    startDateStr = getBstIso(sDate.getUTCFullYear(), sDate.getUTCMonth() + 1, sDate.getUTCDate(), false);
    endDateStr = getBstIso(year, month, day, true);
  } else if (effectiveFilter === "last_30_days") {
    const sDate = new Date(Date.UTC(year, month - 1, day - 29));
    startDateStr = getBstIso(sDate.getUTCFullYear(), sDate.getUTCMonth() + 1, sDate.getUTCDate(), false);
    endDateStr = getBstIso(year, month, day, true);
  } else if (effectiveFilter === "this_month") {
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    startDateStr = getBstIso(year, month, 1, false);
    endDateStr = getBstIso(year, month, lastDayOfMonth, true);
  } else if (effectiveFilter === "last_month") {
    const lastMonthDate = new Date(Date.UTC(year, month - 2, 1));
    const lmYear = lastMonthDate.getUTCFullYear();
    const lmMonth = lastMonthDate.getUTCMonth() + 1;
    const lastDayOfLm = new Date(Date.UTC(lmYear, lmMonth, 0)).getUTCDate();
    startDateStr = getBstIso(lmYear, lmMonth, 1, false);
    endDateStr = getBstIso(lmYear, lmMonth, lastDayOfLm, true);
  } else {
    return { startDateStr: null, endDateStr: null };
  }

  return { startDateStr, endDateStr };
}
