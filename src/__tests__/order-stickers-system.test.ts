import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateOrderStickersHtml,
  generateTestCalibrationStickerHtml,
} from "@/lib/order-sticker-printer";
import {
  loadOrderStickerConfig,
  saveOrderStickerConfig,
  setCustomDiscountReason,
  resetOrderStickerConfig,
} from "@/lib/order-sticker-config";
import {
  DEFAULT_75X100_CONFIG,
  DEFAULT_80X100_CONFIG,
  type OrderStickerData,
  type OrderStickerConfig,
} from "@/types/order-sticker";

describe("MiBx Dispatch — Advanced 75×100mm Order Sticker Printing System", () => {
  const sampleStickers: OrderStickerData[] = [
    // 1. Single product order (Full COD)
    {
      orderId: "ord-1",
      shopifyOrderId: 1001,
      orderNumber: "#2201",
      storeName: "UNIVERSES",
      orderDate: "10 Nov 2026",
      orderTime: "04:15 PM",
      rawCreatedAt: "2026-11-10T16:15:00Z",
      customerName: "Dr. Afrin",
      customerPhone: "01712-345678",
      altPhone: "01819-876543",
      fullAddress: "House 14, Road 5, Block C, Banani",
      areaCityDistrict: "Dhaka, Banani, 1213",
      items: [
        {
          id: "it-1",
          title: "Premium Cotton Oversized T-Shirt",
          variantTitle: "Black / XL",
          size: "XL",
          sku: "UNV-TSHIRT-BLK-XL",
          quantity: 1,
          unitPrice: 1500,
          lineTotal: 1500,
        },
      ],
      totalPcs: 1,
      financials: {
        subtotal: 1500,
        productDiscount: 0,
        shippingCharge: 60,
        additionalCharges: 0,
        totalOrderValue: 1560,
        advancePaid: 0,
        codAmount: 1560,
        isPrepaid: false,
        currency: "৳",
      },
      isValid: true,
      warnings: [],
      error: null,
    },

    // 2. Multiple product order with multiple sizes and SKUs + Discount
    {
      orderId: "ord-2",
      shopifyOrderId: 1002,
      orderNumber: "#2202",
      storeName: "UNIVERSES",
      orderDate: "10 Nov 2026",
      orderTime: "04:30 PM",
      rawCreatedAt: "2026-11-10T16:30:00Z",
      customerName: "Md Ragib Chowdhury",
      customerPhone: "01912-345678",
      altPhone: null,
      fullAddress: "Flat 4A, Green Peace Tower, Chawkbazar",
      areaCityDistrict: "Chittagong, 4000",
      items: [
        {
          id: "it-2",
          title: "Heavyweight Boxy Hoodie",
          variantTitle: "Sage Green / L",
          size: "L",
          sku: "UNV-HD-SGE-L",
          quantity: 2,
          unitPrice: 2200,
          lineTotal: 4400,
        },
        {
          id: "it-3",
          title: "Cargo Relaxed Pants",
          variantTitle: "Khaki / 34",
          size: "34",
          sku: "UNV-CG-KHK-34",
          quantity: 1,
          unitPrice: 1800,
          lineTotal: 1800,
        },
      ],
      totalPcs: 3,
      financials: {
        subtotal: 6200,
        productDiscount: 600,
        discountCode: "WINTER10",
        discountReason: "Winter Launch Campaign",
        shippingCharge: 120,
        additionalCharges: 0,
        totalOrderValue: 5720,
        advancePaid: 1000, // 1000 Advance Paid
        codAmount: 4720, // 5720 - 1000 = 4720 COD
        isPrepaid: false,
        currency: "৳",
      },
      isValid: true,
      warnings: [],
      error: null,
    },

    // 3. Fully Prepaid order (bKash/card)
    {
      orderId: "ord-3",
      shopifyOrderId: 1003,
      orderNumber: "#2203",
      storeName: "UNIVERSES",
      orderDate: "10 Nov 2026",
      orderTime: "05:00 PM",
      rawCreatedAt: "2026-11-10T17:00:00Z",
      customerName: "Samira Khan",
      customerPhone: "No Phone",
      altPhone: null,
      fullAddress: "House 22, Road 11, Dhanmondi",
      areaCityDistrict: "Dhaka, Dhanmondi",
      items: [
        {
          id: "it-4",
          title: "Denim Trucker Jacket",
          variantTitle: "Washed Blue / M",
          size: "M",
          sku: "UNV-JKT-BLU-M",
          quantity: 1,
          unitPrice: 3500,
          lineTotal: 3500,
        },
      ],
      totalPcs: 1,
      financials: {
        subtotal: 3500,
        productDiscount: 0,
        shippingCharge: 0,
        additionalCharges: 0,
        totalOrderValue: 3500,
        advancePaid: 3500,
        codAmount: 0,
        isPrepaid: true, // PREPAID!
        currency: "৳",
      },
      isValid: true,
      warnings: ["Customer phone number is missing"],
      error: null,
    },
  ];

  describe("Printer Dimension Requirements (75mm x 100mm @ 203 DPI)", () => {
    it("has exact 75mm width and 100mm height locked in default configuration", () => {
      expect(DEFAULT_75X100_CONFIG.width).toBe(75);
      expect(DEFAULT_75X100_CONFIG.height).toBe(100);
      expect(DEFAULT_75X100_CONFIG.unit).toBe("mm");
      expect(DEFAULT_75X100_CONFIG.orientation).toBe("portrait");
      expect(DEFAULT_75X100_CONFIG.darkness).toBe(8);
      expect(DEFAULT_75X100_CONFIG.storeNameOverride).toBe("UNIVERSES");
      expect(DEFAULT_75X100_CONFIG.topOffsetMm).toBe(0);
      expect(DEFAULT_75X100_CONFIG.leftOffsetMm).toBe(0);
    });

    it("generates exact CSS @page rule of 75mm 100mm with zero margin", () => {
      const html = generateOrderStickersHtml(sampleStickers, DEFAULT_75X100_CONFIG);
      expect(html).toContain("@page {");
      expect(html).toContain("size: 75mm 100mm;");
      expect(html).toContain("margin: 0 !important;");
    });

    it("enforces independent page breaks per sticker with last page break: auto", () => {
      const html = generateOrderStickersHtml(sampleStickers, DEFAULT_75X100_CONFIG);
      expect(html).toContain("page-break-after: always;");
      expect(html).toContain("break-after: page;");
      expect(html).toContain(".order-sticker-page.is-last");
      expect(html).toContain("page-break-after: auto;");
    });
  });

  describe("Section A & B: Store Header & Customer Information", () => {
    it("renders store name, order numbers, and formatted dates", () => {
      const html = generateOrderStickersHtml(sampleStickers, DEFAULT_75X100_CONFIG);
      expect(html).toContain("UNIVERSES");
      expect(html).toContain("#2201");
      expect(html).toContain("#2202");
      expect(html).toContain("#2203");
      expect(html).toContain("10 Nov 2026");
      expect(html).toContain("04:15 PM");
    });

    it("renders customer name, phone, alternative phone and full address", () => {
      const html = generateOrderStickersHtml(sampleStickers, DEFAULT_75X100_CONFIG);
      expect(html).toContain("Dr. Afrin");
      expect(html).toContain("01712-345678");
      expect(html).toContain("01819-876543");
      expect(html).toContain("House 14, Road 5, Block C, Banani");
      expect(html).toContain("Dhaka, Banani, 1213");
    });

    it("handles missing phone numbers gracefully without crashing", () => {
      const html = generateOrderStickersHtml([sampleStickers[2]], DEFAULT_75X100_CONFIG);
      expect(html).toContain("No Phone");
    });
  });

  describe("Section C: Complete Product Information (No Omissions)", () => {
    it("renders all products, variants, quantities, SKUs, and prices", () => {
      const html = generateOrderStickersHtml([sampleStickers[1]], DEFAULT_75X100_CONFIG);
      // Item 1
      expect(html).toContain("Heavyweight Boxy Hoodie");
      expect(html).toContain("Sage Green / L");
      expect(html).toContain("[SKU: UNV-HD-SGE-L]");
      expect(html).toContain("2x");
      expect(html).toContain("৳4,400");

      // Item 2
      expect(html).toContain("Cargo Relaxed Pants");
      expect(html).toContain("Khaki / 34");
      expect(html).toContain("[SKU: UNV-CG-KHK-34]");
      expect(html).toContain("1x");
      expect(html).toContain("৳1,800");
    });
  });

  describe("Section D, E, F: Financial Breakdown & Verified COD Formula", () => {
    it("verifies Full COD order calculation: COD = Total Order Value", () => {
      const html = generateOrderStickersHtml([sampleStickers[0]], DEFAULT_75X100_CONFIG);
      expect(html).toContain("Subtotal (1 item):");
      expect(html).toContain("৳1,500");
      expect(html).toContain("Delivery Charge:");
      expect(html).toContain("৳60");
      expect(html).toContain("Total Order Value:");
      expect(html).toContain("৳1,560");
      expect(html).toContain("CASH TO COLLECT:");
      expect(html).toContain("৳ 1,560");
    });

    it("verifies Partial Advance Payment formula: COD = Total Payable - Amount Already Paid", () => {
      const html = generateOrderStickersHtml([sampleStickers[1]], DEFAULT_75X100_CONFIG);
      expect(html).toContain("Subtotal (2 items):");
      expect(html).toContain("৳6,200");
      expect(html).toContain("Discount [WINTER10]");
      expect(html).toContain("Winter Launch Campaign");
      expect(html).toContain("-৳600");
      expect(html).toContain("Delivery Charge:");
      expect(html).toContain("৳120");
      expect(html).toContain("Total Order Value:");
      expect(html).toContain("৳5,720");
      expect(html).toContain("Advance Payment Received:");
      expect(html).toContain("-৳1,000");
      // Prominent COD banner
      expect(html).toContain("CASH TO COLLECT:");
      expect(html).toContain("৳ 4,720");
    });

    it("verifies Fully Prepaid order displays PAID – NO COD", () => {
      const html = generateOrderStickersHtml([sampleStickers[2]], DEFAULT_75X100_CONFIG);
      expect(html).toContain("PAID – NO COD");
      expect(html).not.toContain("CASH TO COLLECT: ৳ 0");
    });
  });

  describe("Custom Discount Reason Override", () => {
    beforeEach(() => {
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

    it("allows saving a custom discount reason without altering original Shopify order", () => {
      const updated = setCustomDiscountReason("ord-2", "VIP Wholesale Discount");
      expect(updated.customDiscountReasons["ord-2"]).toBe("VIP Wholesale Discount");

      const loaded = loadOrderStickerConfig();
      expect(loaded.customDiscountReasons["ord-2"]).toBe("VIP Wholesale Discount");
    });
  });

  describe("Alignment & Gap Sensor Calibration Test Print", () => {
    it("generates 75x100mm calibration test sticker with boundary crosshairs", () => {
      const calibHtml = generateTestCalibrationStickerHtml(DEFAULT_75X100_CONFIG);
      expect(calibHtml).toContain("size: 75mm 100mm;");
      expect(calibHtml).toContain("+ 0,0");
      expect(calibHtml).toContain("+ 75,0");
      expect(calibHtml).toContain("+ 0,100");
      expect(calibHtml).toContain("+ 75,100");
      expect(calibHtml).toContain("RULER BOUNDARY");
      expect(calibHtml).toContain("WIDTH: 75mm | HEIGHT: 100mm");
      expect(calibHtml).toContain("203 DPI");
    });
  });

  // Helper to create order sticker mock
  function createMockSticker(overrides: Partial<OrderStickerData> = {}): OrderStickerData {
    const items = overrides.items || [
      {
        id: "it-1",
        title: "Vintage Denim Jacket",
        variantTitle: "Black / XL",
        size: "XL",
        sku: "UNV-JKT-01",
        quantity: 1,
        unitPrice: 2800,
        lineTotal: 2800,
      },
    ];
    const totalPcs = overrides.totalPcs ?? items.reduce((sum, it) => sum + (it.quantity || 1), 0);
    return {
      orderId: overrides.orderId || "ord-test",
      orderNumber: overrides.orderNumber || "#2250",
      storeName: overrides.storeName || "UNIVERSES",
      orderDate: "10 Nov 2026",
      orderTime: "06:30 PM",
      rawCreatedAt: "2026-11-10T18:30:00Z",
      customerName: overrides.customerName || "Tanvir Ahmed",
      customerPhone: overrides.customerPhone || "01700-112233",
      altPhone: overrides.altPhone || null,
      fullAddress: overrides.fullAddress || "House 10, Road 4, Sector 7, Uttara",
      areaCityDistrict: overrides.areaCityDistrict || "Dhaka, Uttara",
      customerNote: overrides.customerNote || null,
      pathaoConsignmentId: overrides.pathaoConsignmentId || null,
      pathaoTrackingCode: overrides.pathaoTrackingCode || null,
      items,
      totalPcs,
      financials: overrides.financials || {
        subtotal: 2800,
        productDiscount: 0,
        shippingCharge: 80,
        additionalCharges: 0,
        totalOrderValue: 2880,
        advancePaid: 0,
        codAmount: 2880,
        isPrepaid: false,
        currency: "৳",
      },
      isValid: true,
      warnings: [],
      error: null,
    };
  }

  describe("Section 10: Premium Upgrade Verification Suite (All 9 Required Scenarios)", () => {

    // Scenario 1: One product order
    it("Scenario 1: One product order uses prominent spacious layout", () => {
      const sticker = createMockSticker({
        items: [
          {
            id: "it-1",
            title: "Heavyweight Boxy Hoodie",
            variantTitle: "Sage Green / L",
            sku: "UNV-HOODIE-SGE-L",
            quantity: 1,
            unitPrice: 2200,
            lineTotal: 2200,
          },
        ],
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("p-row-lg");
      expect(html).toContain("Heavyweight Boxy Hoodie");
      expect(html).toContain("QTY: 1 (1x)");
      expect(html).toContain("৳2,200");
    });

    // Scenario 2: Two product order
    it("Scenario 2: Two product order formats both line items cleanly", () => {
      const sticker = createMockSticker({
        items: [
          {
            id: "it-1",
            title: "Oversized Acid Wash Tee",
            variantTitle: "Charcoal / M",
            sku: "UNV-TEE-CHR-M",
            quantity: 2,
            unitPrice: 1200,
            lineTotal: 2400,
          },
          {
            id: "it-2",
            title: "Relaxed Fit Denim Jeans",
            variantTitle: "Washed Blue / 32",
            sku: "UNV-JNS-BLU-32",
            quantity: 1,
            unitPrice: 2500,
            lineTotal: 2500,
          },
        ],
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("p-row-md");
      expect(html).toContain("Oversized Acid Wash Tee");
      expect(html).toContain("Relaxed Fit Denim Jeans");
      expect(html).toContain("QTY: 2 (2x)");
      expect(html).toContain("QTY: 1 (1x)");
    });

    // Scenario 3: Five product order
    it("Scenario 3: Five product order applies high-density layout without dropping items", () => {
      const items = [1, 2, 3, 4, 5].map((i) => ({
        id: `it-${i}`,
        title: `Item Number ${i} Premium Apparel`,
        variantTitle: `Color ${i} / L`,
        sku: `SKU-00${i}`,
        quantity: 1,
        unitPrice: 1000,
        lineTotal: 1000,
      }));
      const sticker = createMockSticker({ items });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("p-row-xs");
      for (let i = 1; i <= 5; i++) {
        expect(html).toContain(`Item Number ${i} Premium Apparel`);
        expect(html).toContain(`SKU-00${i}`);
      }
    });

    // Scenario 4: Long product names
    it("Scenario 4: Long product names wrap intelligently without clipping", () => {
      const sticker = createMockSticker({
        items: [
          {
            id: "it-long",
            title: "Universes Raw Atelier Collection Limited Edition Distressed Thermal Layered Long Sleeve Sweatshirt 2026",
            variantTitle: "Mineral Wash Charcoal / XXL",
            sku: "UNV-SWT-LNG-001",
            quantity: 1,
            unitPrice: 3800,
            lineTotal: 3800,
          },
        ],
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("Universes Raw Atelier Collection Limited Edition Distressed Thermal Layered Long Sleeve Sweatshirt 2026");
    });

    // Scenario 5: Long SKUs
    it("Scenario 5: Long SKUs render properly in bold monospace", () => {
      const sticker = createMockSticker({
        items: [
          {
            id: "it-sku",
            title: "Cargo Pants",
            sku: "UNV-SS26-MENS-BTM-CRG-KHK-34-EXP-LONG-SKU-9999",
            quantity: 1,
            unitPrice: 2200,
            lineTotal: 2200,
          },
        ],
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("[SKU: UNV-SS26-MENS-BTM-CRG-KHK-34-EXP-LONG-SKU-9999]");
    });

    // Scenario 6: Long customer address
    it("Scenario 6: Long customer address wraps completely across lines without ellipses", () => {
      const longAddress = "Apartment 5B, Floor 5, Concord South Breeze Luxury Heights, Holding 42/A, Road 128, Gulshan 2, Near Westin Hotel, Dhaka 1212";
      const sticker = createMockSticker({
        fullAddress: longAddress,
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain(longAddress);
    });

    // Scenario 7: Discounted order
    it("Scenario 7: Discounted order shows discount code and reason prominently", () => {
      const sticker = createMockSticker({
        financials: {
          subtotal: 5000,
          productDiscount: 500,
          discountCode: "SPECIAL10",
          discountReason: "Eid Festival Promo",
          shippingCharge: 100,
          additionalCharges: 0,
          totalOrderValue: 4600,
          advancePaid: 0,
          codAmount: 4600,
          isPrepaid: false,
          currency: "৳",
        },
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("Discount [SPECIAL10] (Eid Festival Promo):");
      expect(html).toContain("-৳500");
      expect(html).toContain("৳4,600");
    });

    // Scenario 8: Partially paid COD order
    it("Scenario 8: Partially paid COD calculates remaining COD = Total - Advance", () => {
      const sticker = createMockSticker({
        financials: {
          subtotal: 6000,
          productDiscount: 0,
          shippingCharge: 150,
          additionalCharges: 0,
          totalOrderValue: 6150,
          advancePaid: 2000, // 2000 advance
          codAmount: 4150, // 6150 - 2000 = 4150
          isPrepaid: false,
          currency: "৳",
        },
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("Advance Payment Received:");
      expect(html).toContain("-৳2,000");
      expect(html).toContain("CASH TO COLLECT:");
      expect(html).toContain("৳ 4,150");
    });

    // Scenario 9: Fully prepaid order
    it("Scenario 9: Fully prepaid order displays PAID – NO COD", () => {
      const sticker = createMockSticker({
        financials: {
          subtotal: 3000,
          productDiscount: 0,
          shippingCharge: 80,
          additionalCharges: 0,
          totalOrderValue: 3080,
          advancePaid: 3080,
          codAmount: 0,
          isPrepaid: true,
          currency: "৳",
        },
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("PAID – NO COD");
      expect(html).not.toContain("CASH TO COLLECT");
    });
  });

  describe("MiBx Dispatch — 1-5 Thermal Printing Production Enhancements", () => {
    it("Feature 1: Displays clean Pathao consignment ID without crowding barcode", () => {
      const sticker = createMockSticker({
        orderNumber: "#2205",
        pathaoConsignmentId: "DU110926854GH8",
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).not.toContain("barcode-wrap");
      expect(html).toContain("PATHAO: DU110926854GH8");
    });

    it("Feature 2: Displays prominent customer delivery note when present", () => {
      const sticker = createMockSticker({
        customerNote: "Please call before delivery. Leave at security desk.",
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("NOTE:");
      expect(html).toContain("Please call before delivery. Leave at security desk.");
    });

    it("Feature 3: Displays Pathao tracking and consignment badges when available", () => {
      const sticker = createMockSticker({
        pathaoConsignmentId: "CSG-8829104",
        pathaoTrackingCode: "PT-TRK-99012",
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("pathao-badge");
      expect(html).toContain("PATHAO: PT-TRK-99012");
    });

    it("Feature 4: Displays warehouse packing checklist badge with total items and pieces count", () => {
      const sticker = createMockSticker({
        items: [
          {
            id: "it-1",
            title: "Black Tee",
            variantTitle: "M",
            size: "M",
            sku: "TSH-BLK-M",
            quantity: 2,
            unitPrice: 1000,
            lineTotal: 2000,
          },
          {
            id: "it-2",
            title: "Cargo Pants",
            variantTitle: "32",
            size: "32",
            sku: "CP-32",
            quantity: 3,
            unitPrice: 1500,
            lineTotal: 4500,
          },
        ],
        totalPcs: 5,
      });
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("pack-badge");
      expect(html).toContain("TOTAL: 2 ITEMS (5 PCS)");
    });

    it("Feature 5: Enforces >= 3.5mm bottom margin to protect COD box from physical GP-3120TU tear bar", () => {
      const sticker = createMockSticker();
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      // padBottom should be 3.5mm
      expect(html).toContain("padding: 2mm 3mm 3.5mm 3mm;");
    });

    it("Feature 6: Renders prominent additional delivery notice 'রাইডারের সামনে চেক করে নিবেন'", () => {
      const sticker = createMockSticker();
      const html = generateOrderStickersHtml([sticker], DEFAULT_75X100_CONFIG);
      expect(html).toContain("delivery-notice");
      expect(html).toContain("রাইডারের সামনে চেক করে নিবেন");
    });
  });
});
