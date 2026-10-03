import { describe, it, expect } from "vitest";
import { resolveDateRange, formatBstDate, getMonthRange, getAvailableMonths, findMatchingMonth } from "../lib/date-utils";

describe("resolveDateRange", () => {
  it("resolves default/undefined to last_30_days", () => {
    const { startDateStr, endDateStr } = resolveDateRange();
    expect(startDateStr).not.toBeNull();
    expect(endDateStr).not.toBeNull();
    const start = new Date(startDateStr!);
    const end = new Date(endDateStr!);
    expect(start.getTime()).toBeLessThan(end.getTime());
  });

  it("resolves 'all' to null bounds", () => {
    const { startDateStr, endDateStr } = resolveDateRange("all");
    expect(startDateStr).toBeNull();
    expect(endDateStr).toBeNull();
  });

  it("resolves 'today' properly within Bangladesh Time", () => {
    const { startDateStr, endDateStr } = resolveDateRange("today");
    expect(startDateStr).toContain("T");
    expect(endDateStr).toContain("T");
    const startBst = formatBstDate(startDateStr!);
    const endBst = formatBstDate(endDateStr!);
    expect(startBst).toBe(endBst);
  });

  it("resolves 'yesterday' to exactly 1 day before today in BST", () => {
    const { startDateStr, endDateStr } = resolveDateRange("yesterday");
    const startBst = formatBstDate(startDateStr!);
    const endBst = formatBstDate(endDateStr!);
    expect(startBst).toBe(endBst);
  });

  it("resolves 'last_7_days' and 'last_30_days'", () => {
    const l7 = resolveDateRange("last_7_days");
    const l30 = resolveDateRange("last_30_days");
    expect(new Date(l7.startDateStr!).getTime()).toBeGreaterThan(new Date(l30.startDateStr!).getTime());
  });

  it("resolves 'this_month' and 'last_month'", () => {
    const tm = resolveDateRange("this_month");
    const lm = resolveDateRange("last_month");
    expect(new Date(lm.endDateStr!).getTime()).toBeLessThanOrEqual(new Date(tm.startDateStr!).getTime());
  });

  it("resolves 'this_week' starting from Monday in BST", () => {
    const tw = resolveDateRange("this_week");
    expect(tw.startDateStr).not.toBeNull();
    expect(tw.endDateStr).not.toBeNull();
    expect(new Date(tw.startDateStr!).getTime()).toBeLessThan(new Date(tw.endDateStr!).getTime());
  });

  it("resolves 'custom' dates formatted as YYYY-MM-DD", () => {
    const { startDateStr, endDateStr } = resolveDateRange("custom", "2026-09-01", "2026-09-30");
    expect(startDateStr).toBe("2026-08-31T18:00:00.000Z"); // 2026-09-01 00:00:00 BST
    expect(endDateStr).toBe("2026-09-30T17:59:59.999Z");   // 2026-09-30 23:59:59 BST
    expect(formatBstDate(startDateStr!)).toBe("2026-09-01");
    expect(formatBstDate(endDateStr!)).toBe("2026-09-30");
  });

  it("swaps inverted custom dates automatically", () => {
    const { startDateStr, endDateStr } = resolveDateRange("custom", "2026-09-30", "2026-09-01");
    expect(startDateStr).toBe("2026-08-31T18:00:00.000Z");
    expect(endDateStr).toBe("2026-09-30T17:59:59.999Z");
  });

  it("handles ISO strings for custom range without mutating hours", () => {
    const { startDateStr, endDateStr } = resolveDateRange(
      "custom",
      "2026-08-31T18:00:00.000Z",
      "2026-09-30T17:59:59.999Z"
    );
    expect(startDateStr).toBe("2026-08-31T18:00:00.000Z");
    expect(endDateStr).toBe("2026-09-30T17:59:59.999Z");
  });
});

describe("Month Navigation & Range Helpers", () => {
  it("calculates exact calendar start and end dates for any month", () => {
    const jan = getMonthRange(2026, 1);
    expect(jan.startDate).toBe("2026-01-01");
    expect(jan.endDate).toBe("2026-01-31");

    const feb2026 = getMonthRange(2026, 2);
    expect(feb2026.startDate).toBe("2026-02-01");
    expect(feb2026.endDate).toBe("2026-02-28");

    // Leap year
    const feb2024 = getMonthRange(2024, 2);
    expect(feb2024.startDate).toBe("2024-02-01");
    expect(feb2024.endDate).toBe("2024-02-29");

    const apr = getMonthRange(2026, 4);
    expect(apr.startDate).toBe("2026-04-01");
    expect(apr.endDate).toBe("2026-04-30");
  });

  it("lists all months for a year with current and future flags", () => {
    const months = getAvailableMonths(2026);
    expect(months.length).toBe(12);
    expect(months[0].shortName).toBe("Jan");
    expect(months[0].name).toBe("January");
    expect(months[9].shortName).toBe("Oct");
    expect(months[9].month).toBe(10);
  });

  it("accurately detects when a date range matches a calendar month", () => {
    const matchJan = findMatchingMonth("2026-01-01", "2026-01-31");
    expect(matchJan).not.toBeNull();
    expect(matchJan?.month).toBe(1);
    expect(matchJan?.name).toBe("January");

    const matchFeb = findMatchingMonth("2026-02-01", "2026-02-28");
    expect(matchFeb).not.toBeNull();
    expect(matchFeb?.month).toBe(2);

    // Partial range should not match a full calendar month
    const partial = findMatchingMonth("2026-02-05", "2026-02-20");
    expect(partial).toBeNull();

    // Multi-month range should not match a single calendar month
    const multi = findMatchingMonth("2026-01-01", "2026-02-28");
    expect(multi).toBeNull();
  });
});
