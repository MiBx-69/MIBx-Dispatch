import type { DueSlipData, PrinterPaperConfig } from "@/types/due-slip";

/**
 * Generates self-contained standalone HTML and CSS for direct thermal printing.
 * Zero external font or CSS dependencies to guarantee instant, 100% offline rendering.
 * Layout is clean, minimalist, and centered to avoid printer margin border cutoff.
 */
export function generateDueSlipsHtml(
  slips: DueSlipData[],
  config: PrinterPaperConfig
): string {
  const unit = config.unit || "in";
  const widthVal = `${config.width}${unit}`;
  const heightVal = `${config.height}${unit}`;
  const storeName = (config.storeNameOverride?.trim() || slips[0]?.storeName || "STORE").toUpperCase();
  const currencySymbol = config.showCurrencySymbol ? (config.currencySymbol || "৳") : "";

  // Dynamic font sizing based on paper format
  const isCompact = (config.width <= 2.2 && config.height <= 1.5) || config.fontSize === "compact";
  const isLarge = config.width >= 3.5 && config.height >= 4;

  const fontSizes = isCompact
    ? {
        containerPadding: "2px 5px",
        store: "10px",
        orderMeta: "8.5px",
        customer: "9px",
        phone: "10px",
        dueAmount: "11.5px",
      }
    : isLarge
    ? {
        containerPadding: "12px 16px",
        store: "20px",
        orderMeta: "14px",
        customer: "16px",
        phone: "18px",
        dueAmount: "22px",
      }
    : {
        containerPadding: "6px 8px",
        store: "13px",
        orderMeta: "10.5px",
        customer: "11px",
        phone: "12.5px",
        dueAmount: "15px",
      };

  const slipsHtml = slips
    .map((slip, index) => {
      const isPaid = slip.isPaid || slip.dueAmount <= 0;
      const formattedDue = Number(slip.dueAmount || 0).toLocaleString();
      const currentStore = (config.storeNameOverride?.trim() || slip.storeName || storeName).toUpperCase();

      return `
      <div class="due-slip-page ${index === slips.length - 1 ? 'is-last' : ''}">
        <div class="slip-inner">
          <!-- Store Header (Centered) -->
          <div class="slip-header">
            <div class="store-name">${escapeHtml(currentStore)}</div>
          </div>

          <!-- Order & Date (Centered) -->
          <div class="order-meta">
            <span class="order-number">${escapeHtml(slip.orderNumber)}</span>
            ${config.showDate && slip.orderDate ? ` • <span class="order-date">${escapeHtml(slip.orderDate)}</span>` : ""}
          </div>

          <!-- Customer Info: Name & Phone (Centered away from borders) -->
          <div class="customer-info">
            <div class="customer-name">${escapeHtml(slip.customerName || "Guest")}</div>
            <div class="customer-phone">${escapeHtml(slip.customerPhone || "N/A")}</div>
          </div>

          <!-- Due Amount Footer (Centered, clean text without heavy black box) -->
          <div class="slip-footer">
            ${
              isPaid
                ? `<div class="due-text paid">STATUS: PAID (${currencySymbol}0)</div>`
                : `<div class="due-text unpaid">DUE: ${currencySymbol} ${formattedDue}</div>`
            }
          </div>
        </div>
      </div>
      `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Customer Due Slips - ${slips.length} Orders</title>
  <style>
    @page {
      size: ${widthVal} ${heightVal};
      margin: 0 !important;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      width: 100%;
      height: 100%;
      text-align: center;
    }
    .due-slip-page {
      width: ${widthVal};
      height: ${heightVal};
      max-height: ${heightVal};
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      overflow: hidden;
      background: #ffffff;
      color: #000000;
      margin: 0 auto;
      padding: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .due-slip-page.is-last {
      page-break-after: auto;
      break-after: auto;
    }
    .slip-inner {
      width: 100%;
      height: 100%;
      padding: ${fontSizes.containerPadding};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      text-align: center;
      overflow: hidden;
      box-sizing: border-box;
    }
    .slip-header {
      width: 100%;
      text-align: center;
      border-bottom: 1px solid #000000;
      padding-bottom: 1px;
      overflow: hidden;
    }
    .store-name {
      font-size: ${fontSizes.store};
      font-weight: 900;
      letter-spacing: -0.1px;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }
    .order-meta {
      width: 100%;
      text-align: center;
      font-size: ${fontSizes.orderMeta};
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 0 4px;
    }
    .order-number {
      font-weight: 800;
    }
    .order-date {
      font-weight: 500;
      opacity: 0.85;
    }
    .customer-info {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      margin: auto 0;
      overflow: hidden;
      padding: 0 4px; /* safe margin from left and right edges */
      gap: 1px;
    }
    .customer-name {
      width: 100%;
      font-size: ${fontSizes.customer};
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
    }
    .customer-phone {
      width: 100%;
      font-size: ${fontSizes.phone};
      font-weight: 900;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
      letter-spacing: 0.1px;
    }
    .slip-footer {
      width: 100%;
      border-top: 1px solid #000000;
      padding-top: 1px;
      text-align: center;
    }
    .due-text {
      width: 100%;
      text-align: center;
      font-size: ${fontSizes.dueAmount};
      font-weight: 900;
      letter-spacing: -0.2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #000000;
    }

    @media screen {
      body {
        background: #f4f4f5;
        padding: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 15px;
      }
      .due-slip-page {
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        border: 1px solid #d4d4d8;
      }
    }
  </style>
</head>
<body>
  ${slipsHtml}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Triggers printing using a hidden iframe to ensure seamless browser-based printing
 * directly into the installed Windows printer driver (Gprinter GP-3120TU).
 */
export async function printDueSlipsViaIframe(
  slips: DueSlipData[],
  config: PrinterPaperConfig
): Promise<boolean> {
  if (typeof window === "undefined" || slips.length === 0) return false;

  return new Promise((resolve) => {
    try {
      // Remove any existing print iframes
      const existing = document.getElementById("mibx-due-slip-print-frame");
      if (existing) {
        existing.remove();
      }

      const iframe = document.createElement("iframe");
      iframe.id = "mibx-due-slip-print-frame";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.visibility = "hidden";

      document.body.appendChild(iframe);

      const html = generateDueSlipsHtml(slips, config);

      iframe.srcdoc = html;

      iframe.onload = () => {
        // Allow brief time for rendering before printing
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve(true);
          } catch (e) {
            console.error("[Printer] Frame print execution failed:", e);
            resolve(false);
          } finally {
            // Clean up iframe after user completes print dialog
            setTimeout(() => {
              iframe.remove();
            }, 3000);
          }
        }, 350);
      };
    } catch (err) {
      console.error("[Printer] Failed to setup print iframe:", err);
      resolve(false);
    }
  });
}
