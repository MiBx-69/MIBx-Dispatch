/**
 * Shared date utility functions — safe to import in both Server and Client components.
 * No server-side imports (no next/headers, no supabase/server).
 */

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

/**
 * Resolves a named date filter to ISO start/end strings (UTC) adjusted for BST (+06:00).
 */
export function resolveDateRange(
  dateFilter?: string,
  customStart?: string,
  customEnd?: string
): { startDateStr: string | null; endDateStr: string | null } {
  if (!dateFilter || dateFilter === "all") {
    return { startDateStr: null, endDateStr: null };
  }

  const now = new Date();
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = dtf.formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year")!.value);
  const month = parseInt(parts.find((p) => p.type === "month")!.value); // 1-indexed
  const day = parseInt(parts.find((p) => p.type === "day")!.value);

  const getBstIso = (y: number, m: number, d: number, endOfDay = false) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const timeStr = endOfDay ? "23:59:59.999+06:00" : "00:00:00.000+06:00";
    return new Date(`${y}-${pad(m)}-${pad(d)}T${timeStr}`).toISOString();
  };

  let startDateStr: string;
  let endDateStr: string;

  if (dateFilter === "today") {
    startDateStr = getBstIso(year, month, day, false);
    endDateStr = getBstIso(year, month, day, true);
  } else if (dateFilter === "yesterday") {
    const yDate = new Date(Date.UTC(year, month - 1, day - 1));
    startDateStr = getBstIso(yDate.getUTCFullYear(), yDate.getUTCMonth() + 1, yDate.getUTCDate(), false);
    endDateStr = getBstIso(yDate.getUTCFullYear(), yDate.getUTCMonth() + 1, yDate.getUTCDate(), true);
  } else if (dateFilter === "last_7_days") {
    const sDate = new Date(Date.UTC(year, month - 1, day - 6));
    startDateStr = getBstIso(sDate.getUTCFullYear(), sDate.getUTCMonth() + 1, sDate.getUTCDate(), false);
    endDateStr = getBstIso(year, month, day, true);
  } else if (dateFilter === "last_30_days") {
    const sDate = new Date(Date.UTC(year, month - 1, day - 29));
    startDateStr = getBstIso(sDate.getUTCFullYear(), sDate.getUTCMonth() + 1, sDate.getUTCDate(), false);
    endDateStr = getBstIso(year, month, day, true);
  } else if (dateFilter === "this_month") {
    const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    startDateStr = getBstIso(year, month, 1, false);
    endDateStr = getBstIso(year, month, lastDayOfMonth, true);
  } else if (dateFilter === "last_month") {
    const lastMonthDate = new Date(Date.UTC(year, month - 2, 1));
    const lmYear = lastMonthDate.getUTCFullYear();
    const lmMonth = lastMonthDate.getUTCMonth() + 1;
    const lastDayOfLm = new Date(Date.UTC(lmYear, lmMonth, 0)).getUTCDate();
    startDateStr = getBstIso(lmYear, lmMonth, 1, false);
    endDateStr = getBstIso(lmYear, lmMonth, lastDayOfLm, true);
  } else if (dateFilter === "custom" && customStart && customEnd) {
    startDateStr = new Date(customStart).toISOString();
    const end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
    endDateStr = end.toISOString();
  } else {
    return { startDateStr: null, endDateStr: null };
  }

  return { startDateStr, endDateStr };
}
