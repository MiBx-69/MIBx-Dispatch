import { PrinterPaperConfig, GPRINTER_PRESET, PRINTER_PRESETS } from "@/types/due-slip";

const STORAGE_KEY = "mibx_due_slip_printer_config_v1";

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
}

export function loadPrinterConfig(): PrinterPaperConfig {
  const storage = getStorage();
  if (!storage) {
    return GPRINTER_PRESET;
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return GPRINTER_PRESET;
    const parsed = JSON.parse(raw);
    return {
      ...GPRINTER_PRESET,
      ...parsed,
    };
  } catch (e) {
    console.error("[PrinterConfig] Failed to read from localStorage:", e);
    return GPRINTER_PRESET;
  }
}

export function savePrinterConfig(config: PrinterPaperConfig): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("[PrinterConfig] Failed to save to localStorage:", e);
  }
}

export function resetPrinterConfig(): PrinterPaperConfig {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return GPRINTER_PRESET;
}
