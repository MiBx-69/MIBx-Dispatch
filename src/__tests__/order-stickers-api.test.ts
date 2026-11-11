import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/orders/stickers/route";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

describe("POST /api/orders/stickers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when orderIds is empty or not an array", async () => {
    const req = new NextRequest("http://localhost:3000/api/orders/stickers", {
      method: "POST",
      body: JSON.stringify({ orderIds: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("processes order data and applies verified COD formula correctly", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");

    (createServiceClient as any).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "app_settings") {
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                shopify_shop_domain: "universes-test.myshopify.com",
                shopify_access_token: "shpat_test123",
                company_name: "UNIVERSES",
              },
            }),
          };
        }
        if (table === "orders") {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "22222222-2222-2222-2222-222222222222",
                  shopify_order_id: 3001,
                  shopify_order_name: "#3001",
                  customer_name: "Tanzim Hasan",
                  customer_phone: "01755123456",
                  shopify_created_at: "2026-11-10T14:00:00Z",
                  total_price: 3200,
                  subtotal_price: 3500,
                  shipping_charge: 100,
                  discount_amount: 400,
                  cod_amount: 2200, // 1000 was paid in advance!
                  currency: "BDT",
                  financial_status: "partially_paid",
                  note: "Alt phone: 01899887766, deliver afternoon",
                  shipping_address: {
                    name: "Tanzim Hasan",
                    phone: "01755123456",
                    address1: "House 25, Road 7",
                    address2: "Dhanmondi R/A",
                    city: "Dhaka",
                    province: "Dhaka Division",
                    zip: "1209",
                  },
                  line_items: [
                    {
                      title: "Vintage Washed Tee",
                      variant_title: "Charcoal / L",
                      quantity: 2,
                      price: 1750,
                      sku: "VWT-CHR-L",
                    },
                  ],
                },
              ],
              error: null,
            }),
          };
        }
        return {};
      }),
    });

    const req = new NextRequest("http://localhost:3000/api/orders/stickers", {
      method: "POST",
      body: JSON.stringify({
        orderIds: ["22222222-2222-2222-2222-222222222222"],
        customDiscountReasons: {
          "22222222-2222-2222-2222-222222222222": "Flash Sale Voucher",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.stickers).toHaveLength(1);

    const s = json.stickers[0];
    expect(s.orderNumber).toBe("#3001");
    expect(s.customerName).toBe("Tanzim Hasan");
    expect(s.customerPhone).toBe("01755-123456");
    expect(s.altPhone).toBe("01899-887766"); // Extracted from note!
    expect(s.items).toHaveLength(1);
    expect(s.items[0].sku).toBe("VWT-CHR-L");
    expect(s.financials.codAmount).toBe(2200);
    expect(s.financials.advancePaid).toBe(1000);
    expect(s.financials.discountReason).toBe("Flash Sale Voucher");
    expect(s.financials.isPrepaid).toBe(false);
  });

  it("handles Shopify GraphQL GID identifiers e.g. gid://shopify/Order/3001 seamlessly", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");

    (createServiceClient as any).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "app_settings") {
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                shopify_shop_domain: "universes-test.myshopify.com",
                shopify_access_token: "shpat_test123",
                company_name: "UNIVERSES",
              },
            }),
          };
        }
        if (table === "orders") {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "33333333-3333-3333-3333-333333333333",
                  shopify_order_id: 3001,
                  shopify_order_name: "#3001",
                  customer_name: "Tanzim Hasan",
                  customer_phone: "01755123456",
                  total_price: 3200,
                  subtotal_price: 3500,
                  shipping_charge: 100,
                  discount_amount: 400,
                  cod_amount: 3200,
                  currency: "BDT",
                  financial_status: "pending",
                  shipping_address: {
                    name: "Tanzim Hasan",
                    address1: "House 25, Road 7",
                    city: "Dhaka",
                  },
                  line_items: [
                    {
                      title: "Vintage Washed Tee",
                      quantity: 1,
                      price: 3200,
                    },
                  ],
                },
              ],
              error: null,
            }),
          };
        }
        return {};
      }),
    });

    const req = new NextRequest("http://localhost:3000/api/orders/stickers", {
      method: "POST",
      body: JSON.stringify({
        orderIds: ["gid://shopify/Order/3001"],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.stickers).toHaveLength(1);
    expect(json.stickers[0].orderNumber).toBe("#3001");
  });

  it("filters out removed items (current_quantity: 0) and prevents phantom discounts", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");

    // Mock live Shopify order with an edited/removed item
    (createServiceClient as any).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "app_settings") {
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                shopify_shop_domain: "universes-test.myshopify.com",
                shopify_access_token: "shpat_test123",
                company_name: "UNIVERSES",
              },
            }),
          };
        }
        if (table === "orders") {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "44444444-4444-4444-4444-444444444444",
                  shopify_order_id: 4001,
                  shopify_order_name: "#4001",
                  customer_name: "Rafiqul Islam",
                  customer_phone: "01811223344",
                  shipping_address: {
                    name: "Rafiqul Islam",
                    address1: "Gulshan 1",
                    city: "Dhaka",
                  },
                  line_items: [
                    {
                      id: 111,
                      title: "Active T-Shirt",
                      quantity: 1,
                      current_quantity: 1,
                      price: 1200,
                    },
                    {
                      id: 222,
                      title: "Removed Item",
                      quantity: 1,
                      current_quantity: 0, // Removed via order edit in Shopify!
                      price: 1500,
                    },
                  ],
                  total_price: 1260,
                  subtotal_price: 1200,
                  shipping_charge: 60,
                  discount_amount: 0,
                  cod_amount: 1260,
                },
              ],
              error: null,
            }),
          };
        }
        return {};
      }),
    });

    const req = new NextRequest("http://localhost:3000/api/orders/stickers", {
      method: "POST",
      body: JSON.stringify({
        orderIds: ["44444444-4444-4444-4444-444444444444"],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeDefined();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.stickers).toHaveLength(1);

    const sticker = json.stickers[0];
    // Removed item must NOT be in items list!
    expect(sticker.items).toHaveLength(1);
    expect(sticker.items[0].title).toBe("Active T-Shirt");
    // No phantom discount should be created for the removed item!
    expect(sticker.financials.productDiscount).toBe(0);
    expect(sticker.financials.subtotal).toBe(1200);
    expect(sticker.financials.totalOrderValue).toBe(1260);
    expect(sticker.financials.codAmount).toBe(1260);
  });

  it("handles fallback query when .or() fails or returns error", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");

    (createServiceClient as any).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "app_settings") {
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                shopify_shop_domain: "universes-test.myshopify.com",
                shopify_access_token: "shpat_test123",
                company_name: "UNIVERSES",
              },
            }),
          };
        }
        if (table === "orders") {
          return {
            select: vi.fn().mockReturnThis(),
            or: vi.fn().mockResolvedValue({
              data: null,
              error: { message: "column pathao_tracking_code does not exist" },
            }),
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "55555555-5555-5555-5555-555555555555",
                  shopify_order_id: 5001,
                  shopify_order_name: "#5001",
                  customer_name: "Mahbub Hasan",
                  customer_phone: "01711223344",
                  shipping_address: {
                    name: "Mahbub Hasan",
                    address1: "Dhanmondi 32",
                    city: "Dhaka",
                  },
                  line_items: [
                    {
                      title: "Standard Shirt",
                      quantity: 1,
                      price: 2000,
                    },
                  ],
                  total_price: 2080,
                  subtotal_price: 2000,
                  shipping_charge: 80,
                  discount_amount: 0,
                  cod_amount: 2080,
                  pathao_consignment_id: "CSG-5001",
                },
              ],
              error: null,
            }),
          };
        }
        return {};
      }),
    });

    const req = new NextRequest("http://localhost:3000/api/orders/stickers", {
      method: "POST",
      body: JSON.stringify({
        orderIds: ["55555555-5555-5555-5555-555555555555"],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.stickers).toHaveLength(1);
    expect(json.stickers[0].orderNumber).toBe("#5001");
    expect(json.stickers[0].customerName).toBe("Mahbub Hasan");
  });
});
