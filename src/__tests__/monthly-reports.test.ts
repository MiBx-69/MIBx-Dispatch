import { describe, it, expect } from "vitest";
import {
  getMonthRange,
  getAvailableMonths,
  findMatchingMonth,
  getBstToday,
  resolveDateRange,
  formatBstDate,
  MONTH_NAMES,
  MONTH_SHORT_NAMES,
} from "../lib/date-utils";

describe("Month-Wise Report Bar & Monthly Reporting Logic", () => {
  it("provides correct names and short names for all 12 months", () => {
    expect(MONTH_NAMES.length).toBe(12);
    expect(MONTH_SHORT_NAMES.length).toBe(12);
    expect(MONTH_NAMES[0]).toBe("January");
    expect(MONTH_SHORT_NAMES[0]).toBe("Jan");
    expect(MONTH_NAMES[9]).toBe("October");
    expect(MONTH_SHORT_NAMES[9]).toBe("Oct");
    expect(MONTH_NAMES[11]).toBe("December");
    expect(MONTH_SHORT_NAMES[11]).toBe("Dec");
  });

  it("calculates exact calendar start and end dates for all months in 2026", () => {
    const expectedDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (let m = 1; m <= 12; m++) {
      const range = getMonthRange(2026, m);
      const pad = (n: number) => n.toString().padStart(2, "0");
      expect(range.startDate).toBe(`2026-${pad(m)}-01`);
      expect(range.endDate).toBe(`2026-${pad(m)}-${pad(expectedDays[m - 1])}`);
    }
  });

  it("resolves full month ranges through resolveDateRange with accurate BST boundaries", () => {
    // January 2026
    const janRange = getMonthRange(2026, 1);
    const janResolved = resolveDateRange("custom", janRange.startDate, janRange.endDate);
    expect(formatBstDate(janResolved.startDateStr!)).toBe("2026-01-01");
    expect(formatBstDate(janResolved.endDateStr!)).toBe("2026-01-31");

    // September 2026
    const sepRange = getMonthRange(2026, 9);
    const sepResolved = resolveDateRange("custom", sepRange.startDate, sepRange.endDate);
    expect(formatBstDate(sepResolved.startDateStr!)).toBe("2026-09-01");
    expect(formatBstDate(sepResolved.endDateStr!)).toBe("2026-09-30");

    // October 2026 (Current Month)
    const octRange = getMonthRange(2026, 10);
    const octResolved = resolveDateRange("custom", octRange.startDate, octRange.endDate);
    expect(formatBstDate(octResolved.startDateStr!)).toBe("2026-10-01");
    expect(formatBstDate(octResolved.endDateStr!)).toBe("2026-10-31");
  });

  it("identifies matching month from start and end dates", () => {
    const marchMatch = findMatchingMonth("2026-03-01", "2026-03-31");
    expect(marchMatch).not.toBeNull();
    expect(marchMatch?.name).toBe("March");
    expect(marchMatch?.shortName).toBe("Mar");
    expect(marchMatch?.month).toBe(3);
    expect(marchMatch?.year).toBe(2026);

    const octMatch = findMatchingMonth("2026-10-01", "2026-10-31");
    expect(octMatch).not.toBeNull();
    expect(octMatch?.name).toBe("October");
    expect(octMatch?.month).toBe(10);
  });

  it("returns null for arbitrary date ranges that do not match a calendar month", () => {
    expect(findMatchingMonth("2026-01-05", "2026-01-25")).toBeNull();
    expect(findMatchingMonth("2026-01-01", "2026-02-28")).toBeNull();
    expect(findMatchingMonth("", "")).toBeNull();
  });

  it("handles previous years (e.g. 2025) for historical month checking", () => {
    const months2025 = getAvailableMonths(2025);
    expect(months2025.length).toBe(12);
    expect(months2025.every((m) => m.year === 2025)).toBe(true);
    expect(months2025.every((m) => !m.isCurrent)).toBe(true);
    expect(months2025.every((m) => !m.isFuture)).toBe(true);

    const feb2025 = getMonthRange(2025, 2);
    expect(feb2025.startDate).toBe("2025-02-01");
    expect(feb2025.endDate).toBe("2025-02-28");
    const match = findMatchingMonth("2025-02-01", "2025-02-28");
    expect(match?.name).toBe("February");
    expect(match?.year).toBe(2025);
  });
});
