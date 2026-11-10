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
  width: number; // 80mm
  height: number; // 100mm
  unit: "mm" | "in";
  orientation: "portrait";
  darkness: number; // 8
  marginOffsetMm: number; // 0mm default
  storeNameOverride?: string;
  showSku: boolean;
  showAltPhone: boolean;
  customDiscountReasons: Record<string, string>; // orderId -> custom reason
}

export const DEFAULT_80X100_CONFIG: OrderStickerConfig = {
  presetName: "Gprinter GP-3120TU 80×100mm Sticker",
  width: 80,
  height: 100,
  unit: "mm",
  orientation: "portrait",
  darkness: 8,
  marginOffsetMm: 0,
  storeNameOverride: "UNIVERSES",
  showSku: true,
  showAltPhone: true,
  customDiscountReasons: {},
};

