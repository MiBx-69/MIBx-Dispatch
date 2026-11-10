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
});

