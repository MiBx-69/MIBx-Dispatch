import { describe, it, expect } from "vitest";
import {
  computeBusinessMetricsFromDataset,
  computePeriodComparison,
  getOrderOriginalTotal,
  getOrderOriginalSubtotal,
  type RawOrderRecord,
  type RawDispatchRecord,
  type RawReturnRecord,
  type RawTransactionRecord,
} from "@/lib/business-metrics-engine";
import { resolveDateRange, formatBstDate } from "@/lib/date-utils";

describe("Business Metrics Engine — Complete Financial, Return & Courier Audit Suite", () => {
  const startDateIso = "2026-10-01T00:00:00+06:00";
  const endDateIso = "2026-10-31T23:59:59.999+06:00";

  it("1. Preserves original order totals and prevents partial-return double deduction", () => {
    // Legacy order where total_price was previously reduced by 500 from 2000 -> 1500
    const legacyMutatedOrder: RawOrderRecord = {
      id: "ord-legacy-1",
      shopify_order_name: "#1001",
      total_price: 1500,
      subtotal_price: 1400,
      original_total_price: null,
      original_subtotal_price: null,
      internal_status: "delivered",
      shopify_created_at: "2026-10-05T10:00:00+06:00",
      line_items: [
        {
          title: "Premium Panjabi",
          sku: "UR-PJ-01",
          price: 700,
          quantity: 2,
          original_quantity: 3,
        },
      ],
    };

    const partialReturn: RawReturnRecord = {
      id: "ret-1",
      order_id: "ord-legacy-1",
      return_type: "partial",
      refund_amount: 700,
      returned_product_value: 700,
      is_verified: true,
      status: "completed",
      returned_at: "2026-10-08T12:00:00+06:00",
    };

    // Reconstructs original total safely (1500 + 700 = 2200)
    expect(getOrderOriginalTotal(legacyMutatedOrder, [partialReturn])).toBe(2200);
    // Reconstructs original subtotal from original_quantity (3 * 700 = 2100)
    expect(getOrderOriginalSubtotal(legacyMutatedOrder, [partialReturn])).toBe(2100);

    // Modern non-destructive order where original_total_price is explicitly stored
    const modernOrder: RawOrderRecord = {
      id: "ord-modern-1",
      shopify_order_name: "#1002",
      total_price: 2200,
      subtotal_price: 2100,
      original_total_price: 2200,
      original_subtotal_price: 2100,
      shipping_charge: 100,
      internal_status: "delivered",
      shopify_created_at: "2026-10-06T10:00:00+06:00",
      delivered_at: "2026-10-08T15:00:00+06:00",
    };

    const modernPartialReturn: RawReturnRecord = {
      id: "ret-2",
      order_id: "ord-modern-1",
      return_type: "partial",
      refund_amount: 700,
      returned_product_value: 700,
      is_verified: true,
      status: "completed",
      returned_at: "2026-10-09T12:00:00+06:00",
    };

    const report = computeBusinessMetricsFromDataset({
      orders: [modernOrder],
      dispatches: [],
      returns: [modernPartialReturn],
      transactions: [],
      startDateIso,
      endDateIso,
    });

    // Delivered gross sales is 2200, partial return is 700 -> Net sales after returns is 1500 (NOT 800!)
    expect(report.salesPerformance.grossOrderValue).toBe(2200);
    expect(report.salesPerformance.deliveredGrossSalesValue).toBe(2200);
    expect(report.salesPerformance.partialReturnedValueOnDelivered).toBe(700);
    expect(report.salesPerformance.netSalesAfterReturns).toBe(1500);
  });

  it("2. Accurately computes all 18 management metrics, 3 return rate formulas, courier COD reconciliation, and operating result", () => {
    const orders: RawOrderRecord[] = [
      // Order 1: Delivered in full (Gross 1600, Product 1500, Shipping 100)
      {
        id: "ord-1",
        shopify_order_name: "#2001",
        total_price: 1600,
        subtotal_price: 1500,
        original_total_price: 1600,
        original_subtotal_price: 1500,
        shipping_charge: 100,
        discount_amount: 0,
        internal_status: "delivered",
        pathao_consignment_id: "CON-1",
        pathao_delivery_status: "Delivered",
        shopify_created_at: "2026-10-02T10:00:00+06:00",
        delivered_at: "2026-10-04T10:00:00+06:00",
        line_items: [
          { title: "Knit Polo", sku: "SKU-POLO", quantity: 2, price: 750 },
        ],
      },
      // Order 2: Delivered with Partial Return (Gross 2100, Product 2000, Shipping 100; 1 unit of 1000 returned)
      {
        id: "ord-2",
        shopify_order_name: "#2002",
        total_price: 2100,
        subtotal_price: 2000,
        original_total_price: 2100,
        original_subtotal_price: 2000,
        shipping_charge: 100,
        discount_amount: 0,
        internal_status: "delivered",
        pathao_consignment_id: "CON-2",
        pathao_delivery_status: "Partial_Delivery",
        shopify_created_at: "2026-10-03T10:00:00+06:00",
        delivered_at: "2026-10-05T10:00:00+06:00",
        line_items: [
          { title: "Luxury Shirt", sku: "SKU-SHIRT", quantity: 2, price: 1000 },
        ],
      },
      // Order 3: Full Return (Gross 1100, Product 1000, Shipping 100)
      {
        id: "ord-3",
        shopify_order_name: "#2003",
        total_price: 1100,
        subtotal_price: 1000,
        original_total_price: 1100,
        original_subtotal_price: 1000,
        shipping_charge: 100,
        discount_amount: 0,
        internal_status: "returned",
        pathao_consignment_id: "CON-3",
        pathao_delivery_status: "Return",
        return_reason: "Customer refused",
        return_delivery_fee: 60,
        shopify_created_at: "2026-10-04T10:00:00+06:00",
        returned_at: "2026-10-07T10:00:00+06:00",
        line_items: [
          { title: "Luxury Shirt", sku: "SKU-SHIRT", quantity: 1, price: 1000 },
        ],
      },
      // Order 4: Dispatched / In Transit (Gross 1300, Product 1200, Shipping 100)
      {
        id: "ord-4",
        shopify_order_name: "#2004",
        total_price: 1300,
        subtotal_price: 1200,
        original_total_price: 1300,
        original_subtotal_price: 1200,
        shipping_charge: 100,
        discount_amount: 0,
        internal_status: "dispatched",
        pathao_consignment_id: "CON-4",
        pathao_delivery_status: "In_Transit",
        shopify_created_at: "2026-10-05T10:00:00+06:00",
        line_items: [
          { title: "Knit Polo", sku: "SKU-POLO", quantity: 1, price: 1200 },
        ],
      },
      // Order 5: Cancelled before dispatch (Gross 900)
      {
        id: "ord-5",
        shopify_order_name: "#2005",
        total_price: 900,
        subtotal_price: 800,
        original_total_price: 900,
        original_subtotal_price: 800,
        shipping_charge: 100,
        internal_status: "cancelled",
        shopify_created_at: "2026-10-06T10:00:00+06:00",
        line_items: [
          { title: "Basic Tee", sku: "SKU-TEE", quantity: 1, price: 800 },
        ],
      },
    ];

    const dispatches: RawDispatchRecord[] = [
      {
        id: "dsp-1",
        order_id: "ord-1",
        shopify_order_name: "#2001",
        consignment_id: "CON-1",
        pathao_order_status: "Delivered",
        delivery_fee: 80,
        amount_to_collect: 1600,
        expected_cod: 1600,
        actual_cod_collected: 1600,
        return_charge: 0,
        other_deductions: 0,
        actual_received_amount: 1520,
        settlement_status: "settled",
        dispatched_at: "2026-10-02T14:00:00+06:00",
      },
      {
        id: "dsp-2",
        order_id: "ord-2",
        shopify_order_name: "#2002",
        consignment_id: "CON-2",
        pathao_order_status: "Partial_Delivery",
        delivery_fee: 100,
        amount_to_collect: 2100,
        expected_cod: 2100,
        actual_cod_collected: 1100,
        return_charge: 50,
        other_deductions: 10,
        actual_received_amount: 500,
        settlement_status: "partially_settled",
        dispatched_at: "2026-10-03T14:00:00+06:00",
      },
      {
        id: "dsp-3",
        order_id: "ord-3",
        shopify_order_name: "#2003",
        consignment_id: "CON-3",
        pathao_order_status: "Return",
        delivery_fee: 80,
        amount_to_collect: 1100,
        expected_cod: 1100,
        actual_cod_collected: 0,
        return_charge: 60,
        other_deductions: 0,
        actual_received_amount: 0,
        settlement_status: "unsettled",
        dispatched_at: "2026-10-04T14:00:00+06:00",
      },
      {
        id: "dsp-4",
        order_id: "ord-4",
        shopify_order_name: "#2004",
        consignment_id: "CON-4",
        pathao_order_status: "In_Transit",
        delivery_fee: 80,
        amount_to_collect: 1300,
        expected_cod: 1300,
        actual_cod_collected: 0,
        return_charge: 0,
        other_deductions: 0,
        actual_received_amount: 0,
        settlement_status: "unsettled",
        dispatched_at: "2026-10-05T14:00:00+06:00",
      },
    ];

    const returns: RawReturnRecord[] = [
      {
        id: "ret-partial-2",
        order_id: "ord-2",
        dispatch_id: "dsp-2",
        consignment_id: "CON-2",
        return_type: "partial",
        return_reason: "Size issue",
        returned_product_value: 1000,
        refund_amount: 1000,
        return_delivery_fee: 50,
        returned_quantity: 1,
        original_order_quantity: 2,
        is_verified: true,
        status: "completed",
        returned_at: "2026-10-06T12:00:00+06:00",
        processed_at: "2026-10-07T12:00:00+06:00",
        returned_items: [
          { title: "Luxury Shirt", sku: "SKU-SHIRT", quantity: 1, price: 1000 },
        ],
      },
      {
        id: "ret-full-3",
        order_id: "ord-3",
        dispatch_id: "dsp-3",
        consignment_id: "CON-3",
        return_type: "full",
        return_reason: "Customer refused",
        returned_product_value: 1000,
        refund_amount: 1000,
        return_delivery_fee: 60,
        returned_quantity: 1,
        original_order_quantity: 1,
        is_verified: true,
        status: "completed",
        returned_at: "2026-10-07T10:00:00+06:00",
        processed_at: "2026-10-08T10:00:00+06:00",
        returned_items: [
          { title: "Luxury Shirt", sku: "SKU-SHIRT", quantity: 1, price: 1000 },
        ],
      },
    ];

    const transactions: RawTransactionRecord[] = [
      {
        id: "tx-1",
        type: "expense",
        amount: 300,
        category: "Meta Ads",
        description: "October Campaign",
        is_courier_charge: false,
        date: "2026-10-10",
      },
      {
        id: "tx-2",
        type: "expense",
        amount: 100,
        category: "Packaging",
        description: "Poly bags",
        is_courier_charge: false,
        date: "2026-10-11",
      },
    ];

    const report = computeBusinessMetricsFromDataset({
      orders,
      dispatches,
      returns,
      transactions,
      startDateIso,
      endDateIso,
    });

    // 1. Order Performance
    expect(report.orderPerformance.totalOrdersReceived).toBe(5);
    expect(report.orderPerformance.deliveredOrdersCount).toBe(2); // ord-1 & ord-2
    expect(report.orderPerformance.partiallyDeliveredOrdersCount).toBe(1); // ord-2
    expect(report.orderPerformance.fullyReturnedOrdersCount).toBe(1); // ord-3
    expect(report.orderPerformance.inTransitOrdersCount).toBe(1); // ord-4
    expect(report.orderPerformance.cancelledOrdersCount).toBe(1); // ord-5
    expect(report.orderPerformance.eligibleDispatchedOrdersCount).toBe(4); // ord-1, 2, 3, 4
    expect(report.orderPerformance.finalizedEligibleOrdersCount).toBe(3); // ord-1, 2, 3

    // 2. Sales Performance (grossOrderValue excludes cancelled orders; cancelledOrderValue = 900)
    expect(report.salesPerformance.grossOrderValue).toBe(6100); // 1600+2100+1100+1300
    expect(report.salesPerformance.cancelledOrderValue).toBe(900); // ord-5
    expect(report.salesPerformance.deliveredGrossSalesValue).toBe(3700); // 1600+2100
    expect(report.salesPerformance.partialReturnedValueOnDelivered).toBe(1000); // ord-2 partial return
    expect(report.salesPerformance.netSalesAfterReturns).toBe(2700); // 3700 - 1000

    // 3. Return Performance & 3 Required Return Rate Formulas
    expect(report.returnPerformance.fullReturnsCount).toBe(1);
    expect(report.returnPerformance.partialReturnsCount).toBe(1);
    expect(report.returnPerformance.ordersWithAnyReturnCount).toBe(2); // ord-2 (partial) + ord-3 (full)
    expect(report.returnPerformance.totalReturnedProductValue).toBe(2000); // 1000 + 1000
    expect(report.returnPerformance.totalRefundAmount).toBe(2000);

    // Formula 1: Order Return Rate = (1 full + 1 partial) / 4 eligible dispatched = 50%
    expect(report.returnPerformance.orderReturnRate).toBe(50);
    // Formula 2: Finalized Order Return Rate = (1 full + 1 partial) / 3 finalized = 66.67%
    expect(report.returnPerformance.finalizedOrderReturnRate).toBe(66.67);
    // Formula 3: Returned Value Percentage = 2000 / (1500+2000+1000+1200 = 5700) = 35.09%
    expect(report.returnPerformance.returnedValuePercentage).toBe(35.09);

    // 4. Courier & COD Reconciliation
    expect(report.courierPerformance.totalParcelsDispatched).toBe(4);
    expect(report.courierPerformance.totalActualCodCollected).toBe(2700); // 1600 + 1100
    expect(report.courierPerformance.totalForwardDeliveryCharges).toBe(180); // 80 + 100 (delivered parcels)
    expect(report.courierPerformance.totalReturnDeliveryCharges).toBe(110); // 50 + 60
    expect(report.courierPerformance.totalOtherDeductions).toBe(10);
    expect(report.courierPerformance.totalCourierCharges).toBe(300); // 180 + 110 + 10
    expect(report.courierPerformance.netExpectedCourierPayable).toBe(2400); // 2700 - 300
    expect(report.courierPerformance.actualCourierPaymentReceived).toBe(2020); // 1520 + 500
    expect(report.courierPerformance.outstandingCourierBalance).toBe(380); // 2400 - 2020
    expect(report.courierPerformance.pendingCodInTransit).toBe(1300); // ord-4

    // 5. Financial & Operating Result
    expect(report.financialPerformance.recordedOperatingExpenses).toBe(400); // 300 + 100
    // Recorded Operating Result = Net Sales (2700) - Courier Charges (300) - Operating Expenses (400) = 2000
    expect(report.financialPerformance.recordedOperatingResult).toBe(2000);

    // 6. SKU Performance
    const shirtSku = report.skuPerformance.find((s) => s.sku === "SKU-SHIRT");
    expect(shirtSku).toBeDefined();
    expect(shirtSku?.orderedQty).toBe(3); // 2 in ord-2 + 1 in ord-3
    expect(shirtSku?.returnedQty).toBe(2); // 1 in ord-2 + 1 in ord-3
    expect(shirtSku?.unitReturnRate).toBe(66.67);
  });

  it("3. Computes period-over-period comparisons accurately", () => {
    const prevReport = computeBusinessMetricsFromDataset({
      orders: [
        {
          id: "p-1",
          shopify_order_name: "#1901",
          total_price: 1000,
          original_total_price: 1000,
          internal_status: "delivered",
          shopify_created_at: "2026-09-10T10:00:00+06:00",
        },
      ],
      dispatches: [],
      returns: [],
      transactions: [],
      startDateIso: "2026-09-01T00:00:00+06:00",
      endDateIso: "2026-09-30T23:59:59.999+06:00",
    });

    const currReport = computeBusinessMetricsFromDataset({
      orders: [
        {
          id: "c-1",
          shopify_order_name: "#2001",
          total_price: 1500,
          original_total_price: 1500,
          internal_status: "delivered",
          shopify_created_at: "2026-10-10T10:00:00+06:00",
        },
        {
          id: "c-2",
          shopify_order_name: "#2002",
          total_price: 1000,
          original_total_price: 1000,
          internal_status: "delivered",
          shopify_created_at: "2026-10-11T10:00:00+06:00",
        },
      ],
      dispatches: [],
      returns: [],
      transactions: [],
      startDateIso,
      endDateIso,
    });

    const comparison = computePeriodComparison(currReport, prevReport);
    expect(comparison.totalOrdersReceived.current).toBe(2);
    expect(comparison.totalOrdersReceived.previous).toBe(1);
    expect(comparison.totalOrdersReceived.delta).toBe(1);
    expect(comparison.totalOrdersReceived.percentChange).toBe(100);

    expect(comparison.deliveredSalesValue.current).toBe(2500);
    expect(comparison.deliveredSalesValue.previous).toBe(1000);
    expect(comparison.deliveredSalesValue.delta).toBe(1500);
    expect(comparison.deliveredSalesValue.percentChange).toBe(150);
  });

  it("4. Resolves Bangladesh timezone (+06:00) date boundaries without UTC off-by-one shift", () => {
    const range = resolveDateRange("custom", "2026-10-01", "2026-10-31");
    expect(range.startDateStr).toBe("2026-09-30T18:00:00.000Z"); // 2026-10-01T00:00:00.000+06:00
    expect(range.endDateStr).toBe("2026-10-31T17:59:59.999Z");   // 2026-10-31T23:59:59.999+06:00

    // Verify 00:30 AM Dhaka time on Oct 1 (which is 18:30 UTC on Sep 30) formats as Oct 1 in BST
    expect(formatBstDate("2026-09-30T18:30:00.000Z")).toBe("2026-10-01");
  });
});
