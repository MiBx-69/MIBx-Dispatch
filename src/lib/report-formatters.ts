import { format, parseISO, isValid } from "date-fns";

export function formatCurrency(amount: number | string | null | undefined, currency = "BDT"): string {
  const val = Number(amount) || 0;
  const symbol = currency === "BDT" ? "৳" : currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${val.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Format currency specifically for PDF generators (e.g. jsPDF with WinAnsi / Latin-1 fonts)
 * to avoid encoding corruption such as Unicode ৳ turning into ó or breaking character spacing.
 */
export function formatPdfCurrency(amount: number | string | null | undefined, currency = "BDT"): string {
  const val = Math.round(Number(amount) || 0);
  const symbol = currency === "BDT" ? "BDT " : currency === "USD" ? "$ " : `${currency} `;
  return `${symbol}${val.toLocaleString("en-US")}`;
}

/**
 * Sanitize text strings for PDF generation to ensure they only contain characters
 * supported by standard PDF fonts without encoding corruption.
 */
export function cleanPdfText(text: string | number | null | undefined): string {
  if (text == null) return "";
  return String(text)
    .replace(/৳/g, "BDT ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .trim();
}

export function formatCompactNumber(val: number): string {
  if (val >= 1_000_000) {
    return `${(val / 1_000_000).toFixed(1)}M`;
  }
  if (val >= 1_000) {
    return `${(val / 1_000).toFixed(1)}k`;
  }
  return val.toLocaleString();
}

export function formatPercent(value: number | null | undefined): string {
  const val = Number(value) || 0;
  return `${val.toFixed(1)}%`;
}

export function formatDateLabel(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return dateStr;
    return format(d, "MMM dd, yyyy");
  } catch {
    return dateStr;
  }
}

export function formatShortDate(dateStr: string): string {
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return dateStr;
    return format(d, "dd MMM");
  } catch {
    return dateStr;
  }
}

export function generateCsv(headers: string[], rows: (string | number)[][]): string {
  const escapeCell = (cell: string | number) => {
    const str = String(cell ?? "");
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const content = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ].join("\n");

  return content;
}

export function downloadFile(filename: string, content: string, mimeType = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

