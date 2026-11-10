import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/orders/due-slips/route";
import { NextRequest } from "next/server";

// Mock Supabase
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

describe("POST /api/orders/due-slips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when orderIds array is missing or empty", async () => {
    const req = new NextRequest("http://localhost:3000/api/orders/due-slips", {
      method: "POST",
      body: JSON.stringify({ orderIds: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it("processes orders and returns due slips with Shopify and DB data", async () => {
    const { createServiceClient } = await import("@/lib/supabase/server");
    
    // Mock Supabase service client
    (createServiceClient as any).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "app_settings") {
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                shopify_shop_domain: "test-shop.myshopify.com",
                shopify_access_token: "shpat_test123",
                company_name: "TEST STORE",
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
                  id: "11111111-1111-1111-1111-111111111111",
                  shopify_order_id: 2001,
                  shopify_order_name: "#2001",
                  customer_name: "Rahim Chowdhury",
                  customer_phone: "01700112233",
                  shopify_created_at: "2026-11-10T12:00:00Z",
                  total_price: 1500,
                  currency: "BDT",
                  financial_status: "pending",
                  cod_amount: 1500,
                },
              ],
              error: null,
            }),
          };
        }
        return {};
      }),
    });

    const req = new NextRequest("http://localhost:3000/api/orders/due-slips", {
      method: "POST",
      body: JSON.stringify({ orderIds: ["11111111-1111-1111-1111-111111111111"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.slips).toHaveLength(1);
    expect(json.slips[0].orderNumber).toBe("#2001");
    expect(json.slips[0].customerName).toBe("Rahim Chowdhury");
    expect(json.slips[0].customerPhone).toBe("01700112233");
    expect(json.slips[0].dueAmount).toBe(1500);
    expect(json.slips[0].currency).toBe("৳");
    expect(json.slips[0].isValid).toBe(true);
  });
});

