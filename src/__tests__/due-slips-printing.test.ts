import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateDueSlipsHtml,
} from "@/lib/due-slip-printer";
import {
  loadPrinterConfig,
  savePrinterConfig,
  resetPrinterConfig,
} from "@/lib/printer-config";
import {
  GPRINTER_PRESET,
  PRINTER_PRESETS,
  type DueSlipData,
  type PrinterPaperConfig,
} from "@/types/due-slip";

describe("Customer Due Slip Printing Feature (Gprinter GP-3120TU)", () => {
  const sampleSlips: DueSlipData[] = [
    {
      id: "ord-1",
      shopifyOrderId: 1001,
      orderNumber: "#2201",
      storeName: "UNIVERSES RAW",
      customerName: "Dr. Afrin",
      customerPhone: "01712345678",
      orderDate: "10 Nov 2026",
      totalAmount: 2500,
      dueAmount: 2500,
      currency: "৳",
      financialStatus: "pending",
      isPaid: false,
      isValid: true,
      warnings: [],
      error: null,
    },
    {
      id: "ord-2",
      shopifyOrderId: 1002,
      orderNumber: "#2202",
      storeName: "UNIVERSES RAW",
      customerName: "Md Ragib",
      customerPhone: "01819876543",
      orderDate: "10 Nov 2026",
      totalAmount: 1200,
      dueAmount: 0,
      currency: "৳",
      financialStatus: "paid",
      isPaid: true,
      isValid: true,
      warnings: [],
      error: null,
    },
    {
      id: "ord-3",
      shopifyOrderId: 1003,
      orderNumber: "#2203",
      storeName: "UNIVERSES RAW",
      customerName: "Guest Customer",
      customerPhone: "No Phone",
      orderDate: "10 Nov 2026",
      totalAmount: 850,
      dueAmount: 850,
      currency: "৳",
      financialStatus: "pending",
      isPaid: false,
      isValid: true,
      warnings: ["Customer phone number is missing", "Customer name is missing"],
      error: null,
    },
  ];

  describe("Printer Configuration & Gprinter GP-3120TU Defaults", () => {
    beforeEach(() => {
      // Mock localStorage
      const store: Record<string, string> = {};
      vi.stubGlobal("localStorage", {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, val: string) => {
          store[key] = val;
        }),
        removeItem: vi.fn((key: string) => {
          delete store[key];
        }),
      });
    });

    it("has the exact default configuration for Gprinter GP-3120TU (1.49\" x 0.98\")", () => {
      expect(GPRINTER_PRESET.width).toBe(1.49);
      expect(GPRINTER_PRESET.height).toBe(0.98);
      expect(GPRINTER_PRESET.unit).toBe("in");
      expect(GPRINTER_PRESET.fontSize).toBe("compact");
      expect(GPRINTER_PRESET.darkness).toBe(8);
      expect(GPRINTER_PRESET.showDate).toBe(true);
    });

    it("includes standard presets for labels and receipts", () => {
      const presetNames = PRINTER_PRESETS.map((p) => p.presetName);
      expect(presetNames).toContain(GPRINTER_PRESET.presetName);
      expect(PRINTER_PRESETS.some((p) => p.presetName.includes("2.0\""))).toBe(true);
      expect(PRINTER_PRESETS.some((p) => p.presetName.includes("58mm"))).toBe(true);
      expect(PRINTER_PRESETS.some((p) => p.presetName.includes("80mm"))).toBe(true);
    });

    it("persists printer configurations to localStorage and restores them", () => {
      const customConfig: PrinterPaperConfig = {
        ...GPRINTER_PRESET,
        width: 2.0,
        height: 1.0,
        storeNameOverride: "CUSTOM SHOP",
      };

      savePrinterConfig(customConfig);
      const loaded = loadPrinterConfig();

      expect(loaded.width).toBe(2.0);
      expect(loaded.height).toBe(1.0);
      expect(loaded.storeNameOverride).toBe("CUSTOM SHOP");
    });

    it("resets configuration back to Gprinter defaults cleanly", () => {
      savePrinterConfig({
        ...GPRINTER_PRESET,
        width: 4.0,
        height: 6.0,
      });

      const reset = resetPrinterConfig();
      expect(reset.width).toBe(1.49);
      expect(reset.height).toBe(0.98);
    });
  });

  describe("HTML & CSS Generation for Browser Thermal Printing", () => {
    it("generates correct @page rule matching Gprinter GP-3120TU dimensions", () => {
      const html = generateDueSlipsHtml(sampleSlips, GPRINTER_PRESET);
      expect(html).toContain("@page {");
      expect(html).toContain("size: 1.49in 0.98in;");
      expect(html).toContain("margin: 0 !important;");
    });

    it("supports custom dimensions and metric mm units", () => {
      const mmConfig: PrinterPaperConfig = {
        ...GPRINTER_PRESET,
        width: 58,
        height: 40,
        unit: "mm",
      };
      const html = generateDueSlipsHtml(sampleSlips, mmConfig);
      expect(html).toContain("size: 58mm 40mm;");
    });

    it("enforces independent page breaks for each slip", () => {
      const html = generateDueSlipsHtml(sampleSlips, GPRINTER_PRESET);
      // Contains page break rules
      expect(html).toContain("page-break-after: always;");
      expect(html).toContain("break-after: page;");
      expect(html).toContain("page-break-inside: avoid;");
      // Last page overrides break-after
      expect(html).toContain(".due-slip-page.is-last");
      expect(html).toContain("page-break-after: auto;");
    });

    it("includes all required fields on each thermal slip", () => {
      const html = generateDueSlipsHtml(sampleSlips, GPRINTER_PRESET);
      
      // Store name
      expect(html).toContain("UNIVERSES RAW");
      // Order numbers
      expect(html).toContain("#2201");
      expect(html).toContain("#2202");
      expect(html).toContain("#2203");
      // Customer names
      expect(html).toContain("Dr. Afrin");
      expect(html).toContain("Md Ragib");
      // Phones
      expect(html).toContain("01712345678");
      expect(html).toContain("01819876543");
      // Order date
      expect(html).toContain("10 Nov 2026");
      // Due Amount
      expect(html).toContain("2,500");
    });

    it("correctly distinguishes between paid orders and due amounts", () => {
      const html = generateDueSlipsHtml(sampleSlips, GPRINTER_PRESET);

      // Order 1 is unpaid (Due: ৳ 2,500)
      expect(html).toContain("DUE AMT:");
      expect(html).toContain("৳ 2,500");

      // Order 2 is paid (Status: PAID ৳0)
      expect(html).toContain("STATUS:");
      expect(html).toContain("PAID (৳0)");
    });

    it("escapes customer names and phone numbers to prevent XSS", () => {
      const maliciousSlips: DueSlipData[] = [
        {
          id: "xss-1",
          orderNumber: "<script>alert(1)</script>",
          storeName: "STORE & CO <test>",
          customerName: "John <img src=x onerror=alert(1)> Doe",
          customerPhone: "01700<script>",
          orderDate: "10 Nov 2026",
          totalAmount: 100,
          dueAmount: 100,
          currency: "৳",
          financialStatus: "pending",
          isPaid: false,
          isValid: true,
          warnings: [],
        },
      ];

      const html = generateDueSlipsHtml(maliciousSlips, GPRINTER_PRESET);
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<img src=x");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("STORE &amp; CO &lt;TEST&gt;");
    });
  });
});
