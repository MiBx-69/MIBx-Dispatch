import { type NextRequest, NextResponse } from "next/server";
import { resolveDateRange, formatBstDate } from "@/lib/date-utils";
import { getComprehensiveBusinessReport } from "@/lib/business-metrics-engine";
import { escapeCsvCell } from "@/lib/report-formatters";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const preset =
      searchParams.get("preset") || searchParams.get("period") || "this_month";
    const from =
      searchParams.get("from") || searchParams.get("startDate") || undefined;
    const to =
      searchParams.get("to") || searchParams.get("endDate") || undefined;
    const format = searchParams.get("format") || "json"; // "json" | "csv"
    const section = searchParams.get("section") || "monthly_summary";

    const { startDateStr, endDateStr } = resolveDateRange(preset, from, to);
    const effectiveStart =
      startDateStr || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const effectiveEnd = endDateStr || new Date().toISOString();

    const {
      report,
      previousReport,
      comparison,
      rawOrders,
      rawDispatches,
      rawReturns,
      rawTransactions,
    } = await getComprehensiveBusinessReport(effectiveStart, effectiveEnd, {
      includePreviousPeriod: true,
    });

    if (format !== "csv") {
      return NextResponse.json({
        report,
        previousReport,
        comparison,
      });
    }

    const rowToCsv = (cells: any[]) => cells.map((c) => escapeCsvCell(c)).join(",");
    const lines: string[] = [];
    const periodLabel = `${report.period.startDateBst}_to_${report.period.endDateBst}`;

    if (section === "orders") {
      lines.push(
        rowToCsv([
          "Order Number",
          "Order Date (BST)",
          "Customer Name",
          "Customer Phone",
          "Address",
          "Original Total (BDT)",
          "Product Subtotal (BDT)",
          "Shipping Charge (BDT)",
          "Discount (BDT)",
          "Payment Method",
          "Financial Status",
          "Internal Status",
          "Courier Consignment ID",
          "Courier Status",
          "Delivered Date (BST)",
          "Returned Date (BST)",
          "Items Summary",
        ])
      );
      for (const o of rawOrders) {
        const items = Array.isArray(o.line_items)
          ? o.line_items
              .map((i: any) => `${i.title || i.name} (x${i.original_quantity ?? i.quantity ?? 1})`)
              .join("; ")
          : "";
        const addr = o.shipping_address
          ? [o.shipping_address.address1, o.shipping_address.city].filter(Boolean).join(", ")
          : "";
        lines.push(
          rowToCsv([
            o.shopify_order_name,
            formatBstDate(o.shopify_created_at),
            o.customer_name || "",
            o.customer_phone || "",
            addr,
            Number(o.original_total_price ?? o.total_price ?? 0).toFixed(2),
            Number(o.original_subtotal_price ?? o.subtotal_price ?? 0).toFixed(2),
            Number(o.shipping_charge ?? 0).toFixed(2),
            Number(o.discount_amount ?? 0).toFixed(2),
            o.payment_method || "cod",
            o.financial_status || "",
            o.internal_status,
            o.pathao_consignment_id || "",
            o.pathao_delivery_status || "",
            o.delivered_at ? formatBstDate(o.delivered_at) : "",
            o.returned_at ? formatBstDate(o.returned_at) : "",
            items,
          ])
        );
      }
    } else if (section === "dispatches") {
      lines.push(
        rowToCsv([
          "Order Number",
          "Consignment ID",
          "Dispatched Date (BST)",
          "Recipient Name",
          "Recipient Phone",
          "Recipient Address",
          "Expected COD (BDT)",
          "Collected COD (BDT)",
          "Delivery Fee (BDT)",
          "Return Charge (BDT)",
          "Courier Status",
          "Settlement Status",
        ])
      );
      for (const d of rawDispatches) {
        lines.push(
          rowToCsv([
            d.shopify_order_name,
            d.consignment_id,
            formatBstDate(d.dispatched_at),
            d.recipient_name || "",
            d.recipient_phone || "",
            d.recipient_address || "",
            Number(d.expected_cod ?? d.amount_to_collect ?? 0).toFixed(2),
            Number(d.actual_cod_collected ?? 0).toFixed(2),
            Number(d.delivery_fee ?? 0).toFixed(2),
            Number(d.return_charge ?? 0).toFixed(2),
            d.pathao_order_status,
            d.settlement_status || "pending",
          ])
        );
      }
    } else if (section === "deliveries") {
      lines.push(
        rowToCsv([
          "Order Number",
          "Order Date (BST)",
          "Delivered Date (BST)",
          "Customer Name",
          "Customer Phone",
          "Consignment ID",
          "Delivery Type",
          "Order Value (BDT)",
        ])
      );
      for (const o of rawOrders.filter((ord) => ord.internal_status === "delivered")) {
        lines.push(
          rowToCsv([
            o.shopify_order_name,
            formatBstDate(o.shopify_created_at),
            o.delivered_at ? formatBstDate(o.delivered_at) : "",
            o.customer_name || "",
            o.customer_phone || "",
            o.pathao_consignment_id || "",
            o.pathao_delivery_status || "Delivered",
            Number(o.original_total_price ?? o.total_price ?? 0).toFixed(2),
          ])
        );
      }
    } else if (section === "returns") {
      lines.push(
        rowToCsv([
          "Return Reference",
          "Order ID",
          "Consignment ID",
          "Return Date (BST)",
          "Return Type",
          "Paid Return",
          "Reason",
          "Order Total (BDT)",
          "Returned Product Value (BDT)",
          "Refund Amount (BDT)",
          "Return Delivery Fee (BDT)",
          "Verification Status",
          "Workflow Status",
        ])
      );
      for (const r of rawReturns) {
        lines.push(
          rowToCsv([
            r.return_reference || r.id.slice(0, 8),
            r.order_id,
            r.consignment_id || "",
            formatBstDate(r.returned_at),
            r.return_type,
            r.is_paid_return ? "Yes" : "No",
            r.return_reason || "",
            Number(r.order_total ?? 0).toFixed(2),
            Number(r.returned_product_value ?? r.refund_amount ?? 0).toFixed(2),
            Number(r.refund_amount ?? 0).toFixed(2),
            Number(r.return_delivery_fee ?? 0).toFixed(2),
            r.is_verified !== false ? "Verified" : "Pending Verification",
            r.status,
          ])
        );
      }
    } else if (section === "settlements") {
      lines.push(
        rowToCsv([
          "Order Number",
          "Consignment ID",
          "Dispatched Date (BST)",
          "Courier Status",
          "Expected COD (BDT)",
          "Collected COD (BDT)",
          "Delivery Fee (BDT)",
          "Return Charge (BDT)",
          "Other Deductions (BDT)",
          "Net Settlement Payable (BDT)",
          "Actual Received (BDT)",
          "Settlement Status",
          "Payment Reference",
        ])
      );
      for (const d of rawDispatches) {
        const expected = Number(d.expected_cod ?? d.amount_to_collect ?? 0);
        const collected = Number(d.actual_cod_collected ?? 0);
        const delFee = Number(d.delivery_fee ?? 0);
        const retFee = Number(d.return_charge ?? 0);
        const oth = Number(d.other_deductions ?? 0);
        const net = Math.max(0, collected - delFee - retFee - oth);
        lines.push(
          rowToCsv([
            d.shopify_order_name,
            d.consignment_id,
            formatBstDate(d.dispatched_at),
            d.pathao_order_status,
            expected.toFixed(2),
            collected.toFixed(2),
            delFee.toFixed(2),
            retFee.toFixed(2),
            oth.toFixed(2),
            net.toFixed(2),
            Number(d.actual_received_amount ?? 0).toFixed(2),
            d.settlement_status || "pending",
            d.payment_reference || "",
          ])
        );
      }
    } else if (section === "expenses") {
      lines.push(
        rowToCsv([
          "Date (BST)",
          "Type",
          "Category",
          "Description",
          "Amount (BDT)",
          "Payment Method",
          "Reference ID",
          "Receipt URL",
        ])
      );
      for (const t of rawTransactions) {
        lines.push(
          rowToCsv([
            formatBstDate(t.date),
            t.type.toUpperCase(),
            t.category,
            t.description,
            Number(t.amount ?? 0).toFixed(2),
            t.payment_method || "Cash",
            t.reference_id || "",
            t.receipt_url || "",
          ])
        );
      }
    } else if (section === "products") {
      lines.push(
        rowToCsv([
          "Product Name",
          "SKU",
          "Variant",
          "Ordered Qty",
          "Dispatched Qty",
          "Delivered Qty",
          "Returned Qty",
          "Gross Ordered Value (BDT)",
          "Delivered Sales Value (BDT)",
          "Returned Product Value (BDT)",
          "Net Sales Value (BDT)",
          "Unit Return Rate (%)",
          "Value Return Rate (%)",
        ])
      );
      for (const p of report.skuPerformance) {
        lines.push(
          rowToCsv([
            p.productTitle,
            p.sku,
            p.variantTitle,
            p.orderedQty,
            p.dispatchedQty,
            p.deliveredQty,
            p.returnedQty,
            p.grossOrderedValue.toFixed(2),
            p.deliveredSalesValue.toFixed(2),
            p.returnedProductValue.toFixed(2),
            p.netSalesValue.toFixed(2),
            p.unitReturnRate.toFixed(2),
            p.valueReturnRate.toFixed(2),
          ])
        );
      }
    } else {
      // Complete Monthly Business Summary (All 18 Management Metrics + Daily Breakdown + Products)
      lines.push(rowToCsv(["UNIVERSES RAW — COMPLETE BUSINESS & FINANCIAL REPORT"]));
      lines.push(
        rowToCsv(["Reporting Period (Asia/Dhaka)", `${report.period.startDateBst} to ${report.period.endDateBst}`])
      );
      lines.push("");
      lines.push(rowToCsv(["SECTION 1: ORDER & SALES PERFORMANCE", "VALUE"]));
      lines.push(rowToCsv(["1. Total Orders Received", report.orderPerformance.totalOrdersReceived]));
      lines.push(rowToCsv(["2. Gross Original Order Value (BDT)", report.salesPerformance.grossOrderValue.toFixed(2)]));
      lines.push(rowToCsv(["3. Original Product Subtotal Value (BDT)", report.salesPerformance.originalProductSalesValue.toFixed(2)]));
      lines.push(rowToCsv(["4. Shipping Charges Collected (BDT)", report.salesPerformance.shippingChargesCollected.toFixed(2)]));
      lines.push(rowToCsv(["5. Total Delivered Orders", report.orderPerformance.deliveredOrdersCount]));
      lines.push(rowToCsv(["6. Delivered Gross Sales Value (BDT)", report.salesPerformance.deliveredGrossSalesValue.toFixed(2)]));
      lines.push(rowToCsv(["7. Partially Delivered Orders", report.orderPerformance.partiallyDeliveredOrdersCount]));
      lines.push(rowToCsv(["8. Fully Returned Orders", report.orderPerformance.fullyReturnedOrdersCount]));
      lines.push(rowToCsv(["9. Paid Returns Count", report.returnPerformance.paidReturnsCount]));
      lines.push(rowToCsv(["10. Cancelled Orders (Before Dispatch)", report.orderPerformance.cancelledOrdersCount]));
      lines.push(rowToCsv(["11. Total Returned Product Value (BDT)", report.returnPerformance.totalReturnedProductValue.toFixed(2)]));
      lines.push(rowToCsv(["12. Total Refunded Value (BDT)", report.returnPerformance.totalRefundAmount.toFixed(2)]));
      lines.push(rowToCsv(["13. Order Return Rate (% of Dispatched)", `${report.returnPerformance.orderReturnRate}%`]));
      lines.push(rowToCsv(["14. Finalized Order Return Rate (% of Finalized)", `${report.returnPerformance.finalizedOrderReturnRate}%`]));
      lines.push(rowToCsv(["15. Returned Value Percentage (%)", `${report.returnPerformance.returnedValuePercentage}%`]));
      lines.push(rowToCsv(["16. Delivery Success Rate (%)", `${report.deliveryPerformance.deliverySuccessRate}%`]));
      lines.push(rowToCsv(["17. Net Sales After Returns (BDT)", report.salesPerformance.netSalesAfterReturns.toFixed(2)]));
      lines.push("");
      lines.push(rowToCsv(["SECTION 2: COURIER RECONCILIATION & OPERATING FINANCE", "VALUE (BDT)"]));
      lines.push(rowToCsv(["Total Forward Delivery Charges", report.courierPerformance.totalForwardDeliveryCharges.toFixed(2)]));
      lines.push(rowToCsv(["Total Return Delivery Charges", report.courierPerformance.totalReturnDeliveryCharges.toFixed(2)]));
      lines.push(rowToCsv(["Total Pathao / Courier Charges", report.courierPerformance.totalCourierCharges.toFixed(2)]));
      lines.push(rowToCsv(["Total COD Collected by Courier", report.courierPerformance.totalActualCodCollected.toFixed(2)]));
      lines.push(rowToCsv(["Expected Net Courier Payable (After Fees)", report.courierPerformance.netExpectedCourierPayable.toFixed(2)]));
      lines.push(rowToCsv(["Actual Courier Settlement Received", report.courierPerformance.actualCourierPaymentReceived.toFixed(2)]));
      lines.push(rowToCsv(["Outstanding Courier Balance", report.courierPerformance.outstandingCourierBalance.toFixed(2)]));
      lines.push(rowToCsv(["Recorded Operating Expenses (Non-Courier)", report.financialPerformance.recordedOperatingExpenses.toFixed(2)]));
      lines.push(rowToCsv(["Other Recorded Income", report.financialPerformance.otherRecordedIncome.toFixed(2)]));
      lines.push(rowToCsv(["Recorded Operating Result", report.financialPerformance.recordedOperatingResult.toFixed(2)]));
      lines.push("");
      lines.push(
        rowToCsv([
          "DAILY BREAKDOWN (BST)",
          "Orders",
          "Gross Value (BDT)",
          "Delivered Count",
          "Delivered Value (BDT)",
          "Returned Count",
          "Returned Value (BDT)",
          "Net Sales (BDT)",
          "Courier Fees (BDT)",
          "Operating Expenses (BDT)",
        ])
      );
      for (const d of report.dailyTrend) {
        lines.push(
          rowToCsv([
            d.date,
            d.ordersCount,
            d.grossOrderValue.toFixed(2),
            d.deliveredCount,
            d.deliveredSalesValue.toFixed(2),
            d.returnedCount,
            d.returnedValue.toFixed(2),
            d.netSalesValue.toFixed(2),
            d.courierFees.toFixed(2),
            d.expenses.toFixed(2),
          ])
        );
      }
    }

    const csvContent = "\uFEFF" + lines.join("\n");
    const filename = `Universes_RAW_${section}_${periodLabel}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("GET /api/reports/comprehensive error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

