import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatPdfCurrency, cleanPdfText } from "@/lib/report-formatters";
import type { BusinessMetricsReport, PeriodComparisonSummary } from "@/lib/business-metrics-engine";

export type PdfReportType =
  | "daily_sales"
  | "monthly_sales"
  | "monthly_returns"
  | "delivery_performance"
  | "pathao_settlement"
  | "financial_summary"
  | "expense_report"
  | "complete_monthly_report";

const REPORT_TITLES: Record<PdfReportType, string> = {
  daily_sales: "DAILY SALES & CLOSING REPORT",
  monthly_sales: "MONTHLY SALES & ORDER PERFORMANCE REPORT",
  monthly_returns: "MONTHLY RETURNS & RETURN RATE REPORT",
  delivery_performance: "DELIVERY PERFORMANCE & COURIER ANALYTICS REPORT",
  pathao_settlement: "PATHAO COD & COURIER SETTLEMENT REPORT",
  financial_summary: "MONTHLY BUSINESS FINANCIAL SUMMARY",
  expense_report: "OPERATING EXPENSE & FINANCIAL LEDGER REPORT",
  complete_monthly_report: "COMPLETE MONTHLY BUSINESS & FINANCIAL REPORT",
};

export function generateBrandedBusinessPdf(params: {
  reportType: PdfReportType;
  report: BusinessMetricsReport;
  comparison?: PeriodComparisonSummary | null;
  periodLabel?: string;
  settlementParcels?: any[];
  transactions?: any[];
  dailySummary?: any;
}) {
  const {
    reportType,
    report,
    comparison,
    periodLabel,
    settlementParcels = [],
    transactions = [],
    dailySummary,
  } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const title = REPORT_TITLES[reportType] || "BUSINESS PERFORMANCE REPORT";
  const effectivePeriod =
    periodLabel || `${report.period.startDateBst} to ${report.period.endDateBst}`;
  const generatedAt = new Date().toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  });

  // ─── HEADER BANNER ─────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); // Slate-900
  doc.rect(0, 0, pageWidth, 34, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("UNIVERSES RAW — MIBX DISPATCH", 14, 13);

  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text(cleanPdfText(title), 14, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Period (Asia/Dhaka): ${cleanPdfText(effectivePeriod)}`, 14, 27);
  doc.text(`Generated: ${cleanPdfText(generatedAt)} BST`, pageWidth - 14, 27, {
    align: "right",
  });

  let yPos = 42;

  const addSectionHeader = (heading: string) => {
    if (yPos > pageHeight - 35) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(cleanPdfText(heading), 14, yPos);
    yPos += 3;
  };

  // ─── SECTION 1: ORDER & SALES PERFORMANCE ──────────────────────────────────
  if (
    ["daily_sales", "monthly_sales", "financial_summary", "complete_monthly_report"].includes(
      reportType
    )
  ) {
    addSectionHeader("1. Order & Sales Performance Summary");
    const op = report.orderPerformance;
    const sp = report.salesPerformance;
    const rp = report.returnPerformance;

    autoTable(doc, {
      startY: yPos,
      head: [["Metric", "Count / Rate", "Financial Value (BDT)"]],
      body: [
        [
          "Total Orders Received",
          `${op.totalOrdersReceived} orders`,
          formatPdfCurrency(sp.grossOrderValue),
        ],
        [
          "Original Product Sales Value (Excl. Shipping)",
          `${op.totalOrdersReceived - op.cancelledOrdersCount} valid orders`,
          formatPdfCurrency(sp.originalProductSalesValue),
        ],
        [
          "Shipping Charges Collected",
          "—",
          formatPdfCurrency(sp.shippingChargesCollected),
        ],
        [
          "Dispatched Orders",
          `${op.dispatchedOrdersCount} parcels`,
          formatPdfCurrency(sp.dispatchedOrderValue),
        ],
        [
          "Delivered Orders (Including Partial Deliveries)",
          `${op.deliveredOrdersCount} (${report.deliveryPerformance.deliverySuccessRate}%)`,
          formatPdfCurrency(sp.deliveredGrossSalesValue),
        ],
        [
          "Partially Delivered Orders",
          `${op.partiallyDeliveredOrdersCount} orders`,
          `-${formatPdfCurrency(sp.partialReturnedValueOnDelivered)}`,
        ],
        [
          "Fully Returned Orders",
          `${op.fullyReturnedOrdersCount} orders`,
          `-${formatPdfCurrency(rp.fullReturnedProductValue)}`,
        ],
        [
          "Cancelled Orders (Before Dispatch)",
          `${op.cancelledOrdersCount} (${report.deliveryPerformance.cancellationRate}%)`,
          formatPdfCurrency(sp.cancelledOrderValue),
        ],
        [
          "Net Sales After Returns",
          `AOV: ${formatPdfCurrency(sp.averageDeliveredOrderValue)}`,
          formatPdfCurrency(sp.netSalesAfterReturns),
        ],
      ],
      theme: "striped",
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 85, fontStyle: "bold" },
        1: { cellWidth: 45 },
        2: { cellWidth: 50, halign: "right", fontStyle: "bold" },
      },
      margin: { left: 14, right: 14 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // ─── SECTION 2: RETURN PERFORMANCE & FORMULAS ──────────────────────────────
  if (
    ["monthly_returns", "delivery_performance", "complete_monthly_report"].includes(reportType)
  ) {
    addSectionHeader("2. Return Analysis & Standardized Return Percentages");
    const rp = report.returnPerformance;
    const op = report.orderPerformance;

    autoTable(doc, {
      startY: yPos,
      head: [["Return Metric / Formula", "Denominator Cohort", "Result"]],
      body: [
        [
          "Full Returns",
          `${op.fullyReturnedOrdersCount} orders`,
          formatPdfCurrency(rp.fullReturnedProductValue),
        ],
        [
          "Partial Returns",
          `${rp.partialReturnsCount} orders`,
          formatPdfCurrency(rp.partialReturnedProductValue),
        ],
        [
          "Paid Returns (Customer Paid Fee)",
          `${rp.paidReturnsCount} orders`,
          formatPdfCurrency(rp.paidReturnedProductValue),
        ],
        [
          "Total Returned Product Value",
          `${rp.ordersWithAnyReturnCount} orders with return`,
          formatPdfCurrency(rp.totalReturnedProductValue),
        ],
        [
          "Total Refunded Value",
          "Verified Full + Partial Returns",
          formatPdfCurrency(rp.totalRefundAmount),
        ],
        [
          "Total Return Delivery Fees Charged",
          "Normal Returns",
          formatPdfCurrency(rp.totalReturnDeliveryFees),
        ],
        [
          "1. Order Return Rate (All Dispatched)",
          `${rp.ordersWithAnyReturnCount} / ${op.eligibleDispatchedOrdersCount} dispatched orders`,
          `${rp.orderReturnRate}%`,
        ],
        [
          "2. Finalized Order Return Rate",
          `${rp.ordersWithAnyReturnCount} / ${op.finalizedEligibleOrdersCount} finalized orders`,
          `${rp.finalizedOrderReturnRate}%`,
        ],
        [
          "3. Returned Value Percentage",
          `Returned Value / Dispatched Cohort Value`,
          `${rp.returnedValuePercentage}%`,
        ],
      ],
      theme: "grid",
      headStyles: { fillColor: [185, 28, 28], textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: 75, fontStyle: "bold" },
        1: { cellWidth: 65 },
        2: { cellWidth: 40, halign: "right", fontStyle: "bold" },
      },
      margin: { left: 14, right: 14 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;

    if (rp.returnReasonBreakdown.length > 0) {
      addSectionHeader("Return Reasons Breakdown");
      autoTable(doc, {
        startY: yPos,
        head: [["Return Reason", "Count", "Share (%)", "Product Value (BDT)"]],
        body: rp.returnReasonBreakdown.map((r) => [
          cleanPdfText(r.reason),
          String(r.count),
          `${r.percentage}%`,
          formatPdfCurrency(r.value),
        ]),
        theme: "striped",
        headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // ─── SECTION 3: DELIVERY & COURIER SETTLEMENT PERFORMANCE ──────────────────
  if (
    [
      "delivery_performance",
      "pathao_settlement",
      "financial_summary",
      "complete_monthly_report",
    ].includes(reportType)
  ) {
    addSectionHeader("3. Pathao Courier & COD Reconciliation Summary");
    const cp = report.courierPerformance;
    const dp = report.deliveryPerformance;

    autoTable(doc, {
      startY: yPos,
      head: [["Courier & Settlement Metric", "Details", "Amount / Rate"]],
      body: [
        [
          "Delivery Success Rate (Finalized)",
          `${report.orderPerformance.deliveredOrdersCount} / ${report.orderPerformance.finalizedEligibleOrdersCount} finalized`,
          `${dp.deliverySuccessRate}%`,
        ],
        [
          "Average Delivery Time",
          "Dispatched to Delivered",
          `${dp.averageDeliveryTimeDays} days (${dp.averageDeliveryTimeHours} hrs)`,
        ],
        [
          "Total Expected COD on Dispatched Parcels",
          `${cp.totalParcelsDispatched} parcels`,
          formatPdfCurrency(cp.totalExpectedCodOnDispatched),
        ],
        [
          "Actual COD Collected by Pathao",
          `${cp.deliveredParcelsCount} delivered + ${cp.paidReturnParcelsCount} paid returns`,
          formatPdfCurrency(cp.totalActualCodCollected),
        ],
        [
          "Forward Delivery Charges",
          "Pathao Delivery Fees",
          `-${formatPdfCurrency(cp.totalForwardDeliveryCharges)}`,
        ],
        [
          "Return Delivery Charges",
          `${cp.returnedParcelsCount} returned parcels`,
          `-${formatPdfCurrency(cp.totalReturnDeliveryCharges)}`,
        ],
        [
          "Total Pathao Courier Charges",
          "Forward + Return + Deductions",
          `-${formatPdfCurrency(cp.totalCourierCharges)}`,
        ],
        [
          "Net Expected Courier Payable (Receivable)",
          "Collected COD minus Courier Charges",
          formatPdfCurrency(cp.netExpectedCourierPayable),
        ],
        [
          "Actual Courier Settlement Received",
          `${cp.settledParcelsCount} settled parcels`,
          formatPdfCurrency(cp.actualCourierPaymentReceived),
        ],
        [
          "Outstanding Courier COD Balance",
          `${cp.unsettledParcelsCount} unsettled parcels`,
          formatPdfCurrency(cp.outstandingCourierBalance),
        ],
      ],
      theme: "striped",
      headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: 80, fontStyle: "bold" },
        1: { cellWidth: 55 },
        2: { cellWidth: 45, halign: "right", fontStyle: "bold" },
      },
      margin: { left: 14, right: 14 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;

    if (reportType === "pathao_settlement" && settlementParcels.length > 0) {
      addSectionHeader("Parcel-Level Settlement Ledger");
      autoTable(doc, {
        startY: yPos,
        head: [
          [
            "Order",
            "Consignment",
            "Status",
            "Collected COD",
            "Fees",
            "Net Payable",
            "Received",
            "Settlement",
          ],
        ],
        body: settlementParcels.slice(0, 150).map((p: any) => [
          cleanPdfText(p.order_name || ""),
          cleanPdfText(p.consignment_id || ""),
          cleanPdfText(p.pathao_status || ""),
          formatPdfCurrency(p.actual_cod_collected || 0),
          formatPdfCurrency(p.total_charges || 0),
          formatPdfCurrency(p.net_payable || 0),
          formatPdfCurrency(p.actual_received_amount || 0),
          cleanPdfText((p.settlement_status || "pending").toUpperCase()),
        ]),
        theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5 },
        margin: { left: 14, right: 14 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // ─── SECTION 4: FINANCIAL SUMMARY & OPERATING RESULT ───────────────────────
  if (
    ["daily_sales", "financial_summary", "expense_report", "complete_monthly_report"].includes(
      reportType
    )
  ) {
    addSectionHeader("4. Business Financial Summary & Operating Result");
    const fp = report.financialPerformance;

    autoTable(doc, {
      startY: yPos,
      head: [["Financial Line Item", "Notes", "Amount (BDT)"]],
      body: [
        [
          "Gross Order Value",
          "Original Shopify Order Total",
          formatPdfCurrency(fp.grossOrderValue),
        ],
        [
          "Delivered Sales Value",
          "Gross Value of Delivered Orders",
          formatPdfCurrency(fp.deliveredSalesValue),
        ],
        [
          "Net Sales After Returns",
          "Delivered Sales minus Verified Partial Returns",
          formatPdfCurrency(fp.netSalesAfterReturns),
        ],
        [
          "Less: Total Courier Charges",
          "Forward Delivery + Return Charges",
          `-${formatPdfCurrency(fp.totalCourierCharges)}`,
        ],
        [
          "Less: Recorded Operating Expenses",
          "Marketing, Ads, Salary, Rent, Packaging, etc.",
          `-${formatPdfCurrency(fp.recordedOperatingExpenses)}`,
        ],
        [
          "Plus: Other Recorded Income",
          "Direct / Non-Courier Income",
          `+${formatPdfCurrency(fp.otherRecordedIncome)}`,
        ],
        [
          "RECORDED OPERATING RESULT",
          "Net Sales - Courier Charges - Operating Expenses + Other Income",
          formatPdfCurrency(fp.recordedOperatingResult),
        ],
      ],
      theme: "grid",
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5 },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: "bold" },
        1: { cellWidth: 65 },
        2: { cellWidth: 45, halign: "right", fontStyle: "bold" },
      },
      margin: { left: 14, right: 14 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;

    if (fp.expenseCategoryBreakdown.length > 0) {
      addSectionHeader("Operating Expenses by Category");
      autoTable(doc, {
        startY: yPos,
        head: [["Expense Category", "Entries", "Share (%)", "Total Amount (BDT)"]],
        body: fp.expenseCategoryBreakdown.map((e) => [
          cleanPdfText(e.category),
          String(e.count),
          `${e.percentage}%`,
          formatPdfCurrency(e.amount),
        ]),
        theme: "striped",
        headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 8;
    }

    if (reportType === "expense_report" && transactions.length > 0) {
      addSectionHeader("Detailed Financial Transactions Ledger");
      autoTable(doc, {
        startY: yPos,
        head: [["Date", "Type", "Category", "Description", "Method", "Amount (BDT)"]],
        body: transactions.slice(0, 150).map((t: any) => [
          cleanPdfText(String(t.date || "").slice(0, 10)),
          cleanPdfText((t.type || "").toUpperCase()),
          cleanPdfText(t.category || ""),
          cleanPdfText(t.description || ""),
          cleanPdfText(t.payment_method || "Cash"),
          formatPdfCurrency(Number(t.amount || 0)),
        ]),
        theme: "striped",
        headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5 },
        margin: { left: 14, right: 14 },
      });
      yPos = (doc as any).lastAutoTable.finalY + 8;
    }
  }

  // ─── SECTION 5: PRODUCT & SKU PERFORMANCE ──────────────────────────────────
  if (
    ["monthly_sales", "monthly_returns", "complete_monthly_report"].includes(reportType) &&
    report.productPerformance.length > 0
  ) {
    addSectionHeader("5. Top Product & SKU Performance (Sales & Return Rates)");
    autoTable(doc, {
      startY: yPos,
      head: [
        [
          "Product",
          "SKU",
          "Ordered",
          "Delivered",
          "Returned",
          "Net Sales (BDT)",
          "Return %",
        ],
      ],
      body: report.productPerformance.slice(0, 25).map((p) => [
        cleanPdfText(p.productTitle),
        cleanPdfText(p.sku),
        String(p.orderedQty),
        String(p.deliveredQty),
        String(p.returnedQty),
        formatPdfCurrency(p.netSalesValue),
        `${p.unitReturnRate}%`,
      ]),
      theme: "striped",
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;
  }

  // ─── SECTION 6: PREVIOUS PERIOD COMPARISON ─────────────────────────────────
  if (comparison && reportType === "complete_monthly_report") {
    addSectionHeader("6. Period-over-Period Growth Comparison");
    const fmtDelta = (m: { current: number; previous: number; percentChange: number }) =>
      `${m.percentChange >= 0 ? "+" : ""}${m.percentChange}%`;

    autoTable(doc, {
      startY: yPos,
      head: [["KPI", "Current Period", "Previous Period", "Change (%)"]],
      body: [
        [
          "Total Orders Received",
          String(comparison.totalOrdersReceived.current),
          String(comparison.totalOrdersReceived.previous),
          fmtDelta(comparison.totalOrdersReceived),
        ],
        [
          "Gross Order Value",
          formatPdfCurrency(comparison.grossOrderValue.current),
          formatPdfCurrency(comparison.grossOrderValue.previous),
          fmtDelta(comparison.grossOrderValue),
        ],
        [
          "Delivered Sales Value",
          formatPdfCurrency(comparison.deliveredSalesValue.current),
          formatPdfCurrency(comparison.deliveredSalesValue.previous),
          fmtDelta(comparison.deliveredSalesValue),
        ],
        [
          "Net Sales After Returns",
          formatPdfCurrency(comparison.netSalesAfterReturns.current),
          formatPdfCurrency(comparison.netSalesAfterReturns.previous),
          fmtDelta(comparison.netSalesAfterReturns),
        ],
        [
          "Finalized Order Return Rate",
          `${comparison.finalizedOrderReturnRate.current}%`,
          `${comparison.finalizedOrderReturnRate.previous}%`,
          fmtDelta(comparison.finalizedOrderReturnRate),
        ],
        [
          "Recorded Operating Result",
          formatPdfCurrency(comparison.recordedOperatingResult.current),
          formatPdfCurrency(comparison.recordedOperatingResult.previous),
          fmtDelta(comparison.recordedOperatingResult),
        ],
      ],
      theme: "grid",
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 12;
  }

  // ─── SIGNATURE & APPROVAL BLOCK ────────────────────────────────────────────
  if (yPos > pageHeight - 35) {
    doc.addPage();
    yPos = 25;
  } else {
    yPos += 10;
  }

  doc.setDrawColor(148, 163, 184);
  doc.line(14, yPos + 12, 70, yPos + 12);
  doc.line(pageWidth - 70, yPos + 12, pageWidth - 14, yPos + 12);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Prepared By (Operations / Dispatch)", 14, yPos + 17);
  doc.text("Approved By (Management — Universes RAW)", pageWidth - 70, yPos + 17);

  // ─── FOOTER ON ALL PAGES ───────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Universes RAW — MiBx Dispatch Official Business Statement | Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: "center" }
    );
  }

  const safePeriod = report.period.startDateBst.replace(/[^a-zA-Z0-9_-]/g, "");
  doc.save(`Universes_RAW_${reportType}_${safePeriod}.pdf`);
}

