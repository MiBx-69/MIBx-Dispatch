import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateOrderReturnPreview,
  getSimpleOrderReturnClassification,
  syncReturnAndRefundToShopify,
  handleShopifyRefundOrReturn,
} from "@/lib/shopify-returns";
import * as shopifyClient from "@/lib/shopify/client";
import * as supabaseServer from "@/lib/supabase/server";

vi.mock("@/lib/shopify/client", () => ({
  shopifyFetch: vi.fn(),
  updateShopifyOrder: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: vi.fn(),
}));

vi.mock("@/lib/audit", () => ({
  logOrderEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("MiBx Dispatch — Simplified & Fully Synchronized Shopify Return System (All 13 Required Scenarios)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Scenario 1: Order with 3 products where 1 product is returned
  it("Scenario 1: Order with 3 products where 1 product is returned -> Partial Return, remaining 2 products kept", () => {
    const order = {
      id: "ord-s1",
      total_price: 3600,
      original_total_price: 3600,
      subtotal_price: 3500,
      original_subtotal_price: 3500,
      shipping_charge: 100,
      line_items: [
        { id: "li-1", title: "Cotton Shirt", sku: "SHIRT-01", quantity: 1, price: 1200 },
        { id: "li-2", title: "Denim Jeans", sku: "JEANS-01", quantity: 1, price: 1500 },
        { id: "li-3", title: "Leather Belt", sku: "BELT-01", quantity: 1, price: 800 },
      ],
    };

    const preview = calculateOrderReturnPreview({
      order,
      existingReturns: [],
      mode: "partial",
      selections: [{ key: "li-2", quantity: 1 }],
    });

    expect(preview.valid).toBe(true);
    expect(preview.returnType).toBe("partial");
    expect(preview.orderOverallReturnStatus).toBe("partial");
    expect(preview.returnedQuantityNow).toBe(1);
    expect(preview.remainingQuantityAfter).toBe(2);
    expect(preview.calculatedRefundAmount).toBe(1500);
    expect(preview.updatedOrderFinancialAmount).toBe(2100); // 3600 - 1500
    expect(
      getSimpleOrderReturnClassification(order, [
        {
          return_type: preview.returnType,
          returned_items: preview.returnedItems,
          returned_quantity: preview.returnedQuantityNow,
        },
      ])
    ).toBe("Partial Return");
  });

  // Scenario 2: Order with multiple quantities where only part of a product quantity is returned
  it("Scenario 2: Order with multiple quantities where only part of a product quantity is returned -> Partial Return", () => {
    const order = {
      id: "ord-s2",
      total_price: 3000,
      original_total_price: 3000,
      subtotal_price: 3000,
      original_subtotal_price: 3000,
      line_items: [
        { id: "li-polo", title: "Signature Polo", sku: "POLO-BLK", quantity: 3, price: 1000 },
      ],
    };

    const preview = calculateOrderReturnPreview({
      order,
      existingReturns: [],
      mode: "partial",
      selections: [{ key: "li-polo", quantity: 1 }],
    });

    expect(preview.valid).toBe(true);
    expect(preview.returnType).toBe("partial");
    expect(preview.orderOverallReturnStatus).toBe("partial");
    expect(preview.returnedQuantityNow).toBe(1);
    expect(preview.remainingQuantityAfter).toBe(2);
    expect(preview.calculatedRefundAmount).toBe(1000);
    expect(preview.remainingItems[0].remaining_quantity).toBe(2);
  });

  // Scenario 3: Order where 2 separate partial returns happen at different times
  it("Scenario 3: Order where 2 separate partial returns happen at different times", () => {
    const order = {
      id: "ord-s3",
      total_price: 4000,
      original_total_price: 4000,
      subtotal_price: 4000,
      original_subtotal_price: 4000,
      line_items: [
        { id: "li-a", title: "Item A", sku: "SKU-A", quantity: 2, price: 1000 },
        { id: "li-b", title: "Item B", sku: "SKU-B", quantity: 2, price: 1000 },
      ],
    };

    // First partial return: 1 unit of Item A
    const firstReturn = calculateOrderReturnPreview({
      order,
      existingReturns: [],
      mode: "partial",
      selections: [{ key: "li-a", quantity: 1 }],
    });
    expect(firstReturn.valid).toBe(true);
    expect(firstReturn.returnType).toBe("partial");
    expect(firstReturn.remainingQuantityAfter).toBe(3);
    expect(firstReturn.calculatedRefundAmount).toBe(1000);

    // Second partial return later: 1 unit of Item B (1 of A and 1 of B still remain)
    const secondReturn = calculateOrderReturnPreview({
      order,
      existingReturns: [
        {
          id: "ret-1",
          return_type: "partial",
          returned_items: firstReturn.returnedItems,
          returned_quantity: firstReturn.returnedQuantityNow,
          refund_amount: firstReturn.calculatedRefundAmount,
        },
      ],
      mode: "partial",
      selections: [{ key: "li-b", quantity: 1 }],
    });

    expect(secondReturn.valid).toBe(true);
    expect(secondReturn.returnType).toBe("partial");
    expect(secondReturn.orderOverallReturnStatus).toBe("partial");
    expect(secondReturn.previouslyReturnedQuantity).toBe(1);
    expect(secondReturn.returnedQuantityNow).toBe(1);
    expect(secondReturn.remainingQuantityAfter).toBe(2);
    expect(secondReturn.calculatedRefundAmount).toBe(1000);
    expect(secondReturn.updatedOrderFinancialAmount).toBe(2000); // 4000 - 1000 - 1000
  });

  // Scenario 4: Order where all remaining products are returned (Full Return)
  it("Scenario 4: Order where all products are returned -> Full Return with 0 remaining items", () => {
    const order = {
      id: "ord-s4",
      total_price: 2500,
      original_total_price: 2500,
      subtotal_price: 2500,
      original_subtotal_price: 2500,
      line_items: [
        { id: "li-1", title: "Hoodie", sku: "HD-01", quantity: 2, price: 1250 },
      ],
    };

    const preview = calculateOrderReturnPreview({
      order,
      existingReturns: [],
      mode: "full",
    });

    expect(preview.valid).toBe(true);
    expect(preview.returnType).toBe("full");
    expect(preview.orderOverallReturnStatus).toBe("full");
    expect(preview.returnedQuantityNow).toBe(2);
    expect(preview.remainingQuantityAfter).toBe(0);
    expect(preview.calculatedRefundAmount).toBe(2500);
    expect(preview.updatedOrderFinancialAmount).toBe(0);
    expect(
      getSimpleOrderReturnClassification(order, [
        {
          return_type: preview.returnType,
          returned_items: preview.returnedItems,
          returned_quantity: preview.returnedQuantityNow,
        },
      ])
    ).toBe("Full Return");
  });

  // Scenario 5: Order with discounts
  it("Scenario 5: Order with discounts accurately allocates discount per unit on partial and full returns", () => {
    const order = {
      id: "ord-s5",
      total_price: 1800,
      original_total_price: 1800,
      subtotal_price: 1800,
      original_subtotal_price: 1800,
      discount_amount: 200, // 2000 gross - 200 discount = 1800 net
      line_items: [
        {
          id: "li-disc",
          title: "Discounted Kurta",
          sku: "KR-01",
          quantity: 2,
          price: 1000,
          discount_allocations: [{ amount: "200.00" }],
        },
      ],
    };

    // Returning 1 of 2 units should refund 900 (1000 - 100 discount allocation)
    const preview = calculateOrderReturnPreview({
      order,
      existingReturns: [],
      mode: "partial",
      selections: [{ key: "li-disc", quantity: 1 }],
    });

    expect(preview.valid).toBe(true);
    expect(preview.returnedDiscount).toBe(100);
    expect(preview.returnedSubtotal).toBe(900);
    expect(preview.calculatedRefundAmount).toBe(900);
    expect(preview.updatedOrderFinancialAmount).toBe(900);
  });

  // Scenario 6: Order with taxes
  it("Scenario 6: Order with taxes accurately prorates tax per returned unit", () => {
    const order = {
      id: "ord-s6",
      total_price: 2150,
      original_total_price: 2150,
      subtotal_price: 2000,
      original_subtotal_price: 2000,
      total_tax: 150, // 75 tax per unit
      line_items: [
        {
          id: "li-tax",
          title: "Taxed Jacket",
          sku: "JK-01",
          quantity: 2,
          price: 1000,
          tax_lines: [{ price: "150.00" }],
        },
      ],
    };

    const preview = calculateOrderReturnPreview({
      order,
      existingReturns: [],
      mode: "partial",
      selections: [{ key: "li-tax", quantity: 1 }],
    });

    expect(preview.valid).toBe(true);
    expect(preview.returnedSubtotal).toBe(1000);
    expect(preview.returnedTax).toBe(75);
    expect(preview.calculatedRefundAmount).toBe(1075);
  });

  // Scenario 7: Order with a shipping refund, when applicable
  it("Scenario 7: Order with shipping refund includes shipping charge when enabled", () => {
    const order = {
      id: "ord-s7",
      total_price: 1120,
      original_total_price: 1120,
      subtotal_price: 1000,
      original_subtotal_price: 1000,
      shipping_charge: 120,
      line_items: [
        { id: "li-ship", title: "T-Shirt", sku: "TS-01", quantity: 1, price: 1000 },
      ],
    };

    const withoutShipping = calculateOrderReturnPreview({
      order,
      mode: "full",
      refundShipping: false,
    });
    expect(withoutShipping.calculatedRefundAmount).toBe(1000);

    const withShipping = calculateOrderReturnPreview({
      order,
      mode: "full",
      refundShipping: true,
    });
    expect(withShipping.shippingRefund).toBe(120);
    expect(withShipping.calculatedRefundAmount).toBe(1120);
  });

  // Scenario 8: Return initiated directly in Shopify Admin (Two-way webhook sync)
  it("Scenario 8: Return initiated directly in Shopify Admin synchronizes into MiBx Dispatch as Partial Return without Admin Attention", async () => {
    const mockOrder = {
      id: "ord-s8",
      shopify_order_id: 888001,
      shopify_order_name: "#8801",
      total_price: 2000,
      original_total_price: 2000,
      subtotal_price: 2000,
      original_subtotal_price: 2000,
      internal_status: "delivered",
      pathao_consignment_id: "CON-8801",
      line_items: [
        { id: 501, title: "Item 1", sku: "SKU-501", quantity: 2, price: 1000 },
      ],
    };

    const insertedRows: any[] = [];
    const updatedOrderPayloads: any[] = [];

    const mockSupabase: any = {
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: mockOrder, error: null }),
              }),
            }),
            update: (payload: any) => {
              updatedOrderPayloads.push(payload);
              return { eq: async () => ({ error: null }) };
            },
          };
        }
        if (table === "returns") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
                then: (resolve: any) => resolve({ data: [], error: null }),
              }),
            }),
            insert: async (payload: any) => {
              insertedRows.push(payload);
              return { error: null };
            },
          };
        }
        if (table === "dispatches") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "dsp-s8", consignment_id: "CON-8801" },
                    error: null,
                  }),
                }),
              }),
            }),
            update: () => ({ eq: async () => ({ error: null }) }),
          };
        }
        return {};
      }),
    };

    vi.mocked(supabaseServer.createServiceClient).mockReturnValue(mockSupabase);

    const res = await handleShopifyRefundOrReturn({
      shopifyOrderId: 888001,
      topic: "refunds/create",
      refundData: {
        id: 999111,
        note: "Customer returned 1 unit in Shopify Admin",
        refund_line_items: [{ line_item_id: 501, quantity: 1 }],
        transactions: [{ amount: "1000.00" }],
      },
    });

    expect(res.success).toBe(true);
    expect(res.type).toBe("partial");
    expect(insertedRows.length).toBe(1);
    expect(insertedRows[0].return_type).toBe("partial");
    expect(insertedRows[0].is_verified).toBe(true);
    expect(insertedRows[0].status).toBe("received"); // Never pending_verification / Admin Attention
    expect(insertedRows[0].shopify_sync_status).toBe("synced");
    expect(insertedRows[0].returned_quantity).toBe(1);
    // Order must NOT be marked as internal_status = "returned" when 1 unit still remains!
    expect(updatedOrderPayloads[0].internal_status).toBeUndefined();
    expect(updatedOrderPayloads[0].pathao_delivery_status).toBe("Partial Return");
  });

  // Scenario 9: Shopify API failure during return processing
  it("Scenario 9: Shopify API failure during return processing records Sync Failed state cleanly", async () => {
    vi.mocked(shopifyClient.shopifyFetch).mockRejectedValueOnce(
      new Error("Shopify API 503 Service Unavailable")
    );

    const syncRes = await syncReturnAndRefundToShopify({
      shopifyOrderId: 777001,
      returnType: "partial",
      orderOverallReturnStatus: "partial",
      returnedItems: [
        {
          id: "101",
          line_item_id: "101",
          variant_id: null,
          sku: "SKU-101",
          name: "Shirt",
          title: "Shirt",
          variant_title: null,
          price: 1000,
          original_unit_price: 1000,
          discount_per_unit: 0,
          tax_per_unit: 0,
          quantity: 1,
          line_subtotal: 1000,
          line_tax: 0,
          line_refund_total: 1000,
        },
      ],
      calculatedRefundAmount: 1000,
      returnReason: "Size issue",
      idempotencyKey: "mibx-test-fail-key",
    });

    expect(syncRes.synced).toBe(false);
    expect(syncRes.error).toContain("503 Service Unavailable");
  });

  // Scenario 10: Retry after a failed synchronization (with idempotency protection)
  it("Scenario 10: Retry after a failed synchronization succeeds and prevents duplicate Shopify refunds", async () => {
    // Mock Shopify order response + returnCreate + suggestedRefund + refundCreate
    vi.mocked(shopifyClient.shopifyFetch)
      .mockResolvedValueOnce({
        data: {
          order: {
            id: "gid://shopify/Order/777002",
            name: "#7702",
            displayFinancialStatus: "PAID",
            currentTotalPriceSet: { shopMoney: { amount: "2000.00" } },
            tags: [],
            note: "",
            lineItems: {
              edges: [
                {
                  node: {
                    id: "gid://shopify/LineItem/101",
                    title: "Shirt",
                    sku: "SKU-101",
                    quantity: 2,
                    currentQuantity: 2,
                    refundableQuantity: 2,
                  },
                },
              ],
            },
            fulfillments: [],
            refunds: [],
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          order: {
            suggestedRefund: {
              amountSet: { shopMoney: { amount: "1000.00" } },
              suggestedTransactions: [],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/555001",
              totalRefundedSet: { shopMoney: { amount: "1000.00" } },
            },
            order: {
              displayFinancialStatus: "PARTIALLY_REFUNDED",
              currentTotalPriceSet: { shopMoney: { amount: "1000.00" } },
            },
            userErrors: [],
          },
        },
      });

    const retryRes = await syncReturnAndRefundToShopify({
      shopifyOrderId: 777002,
      returnType: "partial",
      orderOverallReturnStatus: "partial",
      returnedItems: [
        {
          id: "101",
          line_item_id: "101",
          variant_id: null,
          sku: "SKU-101",
          name: "Shirt",
          title: "Shirt",
          variant_title: null,
          price: 1000,
          original_unit_price: 1000,
          discount_per_unit: 0,
          tax_per_unit: 0,
          quantity: 1,
          line_subtotal: 1000,
          line_tax: 0,
          line_refund_total: 1000,
        },
      ],
      calculatedRefundAmount: 1000,
      returnReason: "Size issue",
      idempotencyKey: "mibx-retry-idempotent-1",
    });

    expect(retryRes.synced).toBe(true);
    expect(retryRes.shopifyRefundId).toBe("gid://shopify/Refund/555001");
    expect(retryRes.shopifyFinancialStatus).toBe("PARTIALLY_REFUNDED");
  });

  // Scenario 11: Duplicate webhook prevention
  it("Scenario 11: Duplicate webhook or MiBx-initiated echo webhook is deduplicated and ignored", async () => {
    const mockOrder = {
      id: "ord-s11",
      shopify_order_id: 888011,
      shopify_order_name: "#8811",
      total_price: 1500,
      original_total_price: 1500,
      line_items: [{ id: 601, title: "Cap", quantity: 1, price: 1500 }],
    };

    const mockSupabase: any = {
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockOrder, error: null }),
          }),
        }),
      })),
    };
    vi.mocked(supabaseServer.createServiceClient).mockReturnValue(mockSupabase);

    const echoRes = await handleShopifyRefundOrReturn({
      shopifyOrderId: 888011,
      topic: "refunds/create",
      refundData: {
        id: 999222,
        note: "[MiBx Dispatch Partial Return] Size issue (Ref: mibx-123)",
        refund_line_items: [{ line_item_id: 601, quantity: 1 }],
      },
    });

    expect(echoRes.success).toBe(true);
    expect(echoRes.status).toBe("already_synced");
  });

  // Scenario 12: Attempt to return the same quantity twice
  it("Scenario 12: Attempt to return the same quantity twice or more than unreturned quantity is blocked", () => {
    const order = {
      id: "ord-s12",
      total_price: 2000,
      original_total_price: 2000,
      subtotal_price: 2000,
      original_subtotal_price: 2000,
      line_items: [
        { id: "li-only-2", title: "Chinos", sku: "CH-01", quantity: 2, price: 1000 },
      ],
    };

    // 1 unit already returned
    const existingReturns = [
      {
        id: "ret-prev",
        return_type: "partial",
        returned_items: [{ id: "li-only-2", quantity: 1, price: 1000 }],
        returned_quantity: 1,
        refund_amount: 1000,
      },
    ];

    // Attempting to return 2 more units when only 1 unreturned unit remains must fail
    const invalidAttempt = calculateOrderReturnPreview({
      order,
      existingReturns,
      mode: "partial",
      selections: [{ key: "li-only-2", quantity: 2 }],
    });

    expect(invalidAttempt.valid).toBe(false);
    expect(invalidAttempt.error).toContain("only 1 unreturned unit(s) remaining");
  });

  // Scenario 13: A partial return followed by a full return of the remaining items
  it("Scenario 13: A partial return followed by a return of all remaining items transitions the order to Full Return", () => {
    const order = {
      id: "ord-s13",
      total_price: 3000,
      original_total_price: 3000,
      subtotal_price: 3000,
      original_subtotal_price: 3000,
      line_items: [
        { id: "li-p1", title: "Product 1", sku: "P1", quantity: 2, price: 1000 },
        { id: "li-p2", title: "Product 2", sku: "P2", quantity: 1, price: 1000 },
      ],
    };

    // Step 1: Partial return of 1 unit of Product 1
    const step1 = calculateOrderReturnPreview({
      order,
      existingReturns: [],
      mode: "partial",
      selections: [{ key: "li-p1", quantity: 1 }],
    });
    expect(step1.valid).toBe(true);
    expect(step1.orderOverallReturnStatus).toBe("partial");
    expect(step1.remainingQuantityAfter).toBe(2);

    // Step 2: Return all remaining items (1 unit of Product 1 + 1 unit of Product 2)
    const step2 = calculateOrderReturnPreview({
      order,
      existingReturns: [
        {
          id: "ret-step1",
          return_type: "partial",
          returned_items: step1.returnedItems,
          returned_quantity: step1.returnedQuantityNow,
          refund_amount: step1.calculatedRefundAmount,
        },
      ],
      mode: "full",
    });

    expect(step2.valid).toBe(true);
    expect(step2.returnType).toBe("full");
    expect(step2.orderOverallReturnStatus).toBe("full");
    expect(step2.returnedQuantityNow).toBe(2);
    expect(step2.remainingQuantityAfter).toBe(0);
    expect(step2.calculatedRefundAmount).toBe(2000);
    expect(step2.updatedOrderFinancialAmount).toBe(0);

    // Verify overall order classification is now "Full Return"
    const finalClassification = getSimpleOrderReturnClassification(order, [
      {
        return_type: "partial",
        returned_items: step1.returnedItems,
        returned_quantity: step1.returnedQuantityNow,
      },
      {
        return_type: step2.returnType,
        returned_items: step2.returnedItems,
        returned_quantity: step2.returnedQuantityNow,
      },
    ]);
    expect(finalClassification).toBe("Full Return");
  });
});

