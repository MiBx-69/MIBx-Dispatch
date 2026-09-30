import { describe, it, expect } from "vitest";
import { formatPdfCurrency, cleanPdfText, formatCurrency } from "@/lib/report-formatters";

describe("Report Formatters & PDF Text Sanitization", () => {
  it("formats PDF currency using standard ASCII BDT to prevent WinAnsi font corruption", () => {
    expect(formatPdfCurrency(473037)).toBe("BDT 473,037");
    expect(formatPdfCurrency(338270)).toBe("BDT 338,270");
    expect(formatPdfCurrency(0)).toBe("BDT 0");
    expect(formatPdfCurrency(1200.45)).toBe("BDT 1,200");
  });

  it("supports non-BDT currency for PDF output", () => {
    expect(formatPdfCurrency(150, "USD")).toBe("$ 150");
    expect(formatPdfCurrency(150, "EUR")).toBe("EUR 150");
  });

  it("sanitizes Unicode Bengali symbols, curly quotes, and emojis from PDF strings", () => {
    expect(cleanPdfText("Total: ৳473,037")).toBe("Total: BDT 473,037");
    expect(cleanPdfText("Shirt ‘Special’ Edition")).toBe("Shirt 'Special' Edition");
    expect(cleanPdfText("“Premium” Cotton – Red")).toBe('"Premium" Cotton - Red');
    expect(cleanPdfText("Fire Hoodie 🔥 Sale")).toBe("Fire Hoodie  Sale");
    expect(cleanPdfText(null)).toBe("");
  });

  it("preserves standard formatCurrency for web UI", () => {
    expect(formatCurrency(100)).toContain("৳");
  });
});
