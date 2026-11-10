export interface OrderStickerLineItem {
  id: string | number;
  title: string;
  variantTitle?: string | null;
  size?: string | null;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderStickerFinancials {
  subtotal: number;
  productDiscount: number;
  discountCode?: string | null;
  discountReason?: string | null;
  shippingCharge: number;
  additionalCharges: number;
  totalOrderValue: number;
  advancePaid: number;
  codAmount: number;
  isPrepaid: boolean;
  currency: string;
}

export interface OrderStickerData {
  orderId: string; // Supabase internal UUID
  shopifyOrderId?: number | string | null;
  orderNumber: string; // e.g. "#2203"
  storeName: string; // e.g. "UNIVERSES"
  orderDate: string; // e.g. "10 Nov 2026"
  orderTime: string; // e.g. "04:25 PM"
  rawCreatedAt: string;

  // Customer Details
  customerName: string;
  customerPhone: string;
  altPhone?: string | null;
  fullAddress: string;
  areaCityDistrict: string;

  // Line items
  items: OrderStickerLineItem[];

  // Financial Breakdown
  financials: OrderStickerFinancials;

  // Validation & Warnings
  isValid: boolean;
  warnings: string[];
  error?: string | null;
}

export interface OrderStickerConfig {
  presetName: string;
  width: number; // 75mm (2.9528 in)
  height: number; // 100mm (3.937 in)
  unit: "mm" | "in";
  orientation: "portrait";
  darkness: number; // 8
  marginOffsetMm: number; // default 0mm
  topOffsetMm: number; // top offset alignment adjustment
  leftOffsetMm: number; // left offset alignment adjustment
  storeNameOverride?: string;
  showSku: boolean;
  showAltPhone: boolean;
  customDiscountReasons: Record<string, string>; // orderId -> custom reason
}

export const DEFAULT_75X100_CONFIG: OrderStickerConfig = {
  presetName: "Gprinter GP-3120TU 75×100mm Sticker",
  width: 75,
  height: 100,
  unit: "mm",
  orientation: "portrait",
  darkness: 8,
  marginOffsetMm: 0,
  topOffsetMm: 0,
  leftOffsetMm: 0,
  storeNameOverride: "UNIVERSES",
  showSku: true,
  showAltPhone: true,
  customDiscountReasons: {},
};

// Alias for compatibility
export const DEFAULT_80X100_CONFIG = DEFAULT_75X100_CONFIG;
