export interface DueSlipData {
  id: string; // Supabase Order ID or identifier
  shopifyOrderId?: number | string | null;
  orderNumber: string; // e.g. "#2203"
  storeName: string; // e.g. "UNIVERSES RAW"
  customerName: string; // e.g. "Jony Islam"
  customerPhone: string; // e.g. "01712-345678"
  orderDate: string; // e.g. "10 Nov 2026"
  rawOrderDate?: string;
  totalAmount: number;
  dueAmount: number;
  currency: string; // e.g. "৳" or "BDT"
  financialStatus: string; // e.g. "pending", "paid", "partially_paid"
  isPaid: boolean;
  isValid: boolean;
  warnings: string[];
  error?: string | null;
}

export type PaperUnit = "in" | "mm";

export interface PrinterPaperConfig {
  presetName: string;
  width: number;
  height: number;
  unit: PaperUnit;
  fontSize: "compact" | "normal" | "large";
  darkness: number; // visual contrast / bold level
  storeNameOverride?: string;
  showDate: boolean;
  showCurrencySymbol: boolean;
  currencySymbol: string;
}

export const GPRINTER_PRESET: PrinterPaperConfig = {
  presetName: "Gprinter GP-3120TU (1.49\" × 0.98\")",
  width: 1.49,
  height: 0.98,
  unit: "in",
  fontSize: "compact",
  darkness: 8,
  showDate: true,
  showCurrencySymbol: true,
  currencySymbol: "৳",
};

export const PRINTER_PRESETS: PrinterPaperConfig[] = [
  GPRINTER_PRESET,
  {
    presetName: "Thermal Label 2.0\" × 1.0\" (50 × 25 mm)",
    width: 2.0,
    height: 1.0,
    unit: "in",
    fontSize: "normal",
    darkness: 8,
    showDate: true,
    showCurrencySymbol: true,
    currencySymbol: "৳",
  },
  {
    presetName: "Thermal Label 3.0\" × 2.0\" (76 × 50 mm)",
    width: 3.0,
    height: 2.0,
    unit: "in",
    fontSize: "normal",
    darkness: 8,
    showDate: true,
    showCurrencySymbol: true,
    currencySymbol: "৳",
  },
  {
    presetName: "Shipping Label 4.0\" × 6.0\" (100 × 150 mm)",
    width: 4.0,
    height: 6.0,
    unit: "in",
    fontSize: "large",
    darkness: 8,
    showDate: true,
    showCurrencySymbol: true,
    currencySymbol: "৳",
  },
  {
    presetName: "Receipt 58mm (Continuous)",
    width: 58,
    height: 40,
    unit: "mm",
    fontSize: "compact",
    darkness: 8,
    showDate: true,
    showCurrencySymbol: true,
    currencySymbol: "৳",
  },
  {
    presetName: "Receipt 80mm (Continuous)",
    width: 80,
    height: 50,
    unit: "mm",
    fontSize: "normal",
    darkness: 8,
    showDate: true,
    showCurrencySymbol: true,
    currencySymbol: "৳",
  },
];

