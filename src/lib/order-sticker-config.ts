import { OrderStickerConfig, DEFAULT_75X100_CONFIG } from "@/types/order-sticker";

const STORAGE_KEY = "mibx_order_sticker_75x100_config_v1";

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof globalThis !== "undefined" && (globalThis as any).localStorage) {
    return (globalThis as any).localStorage;
  }
  return null;
}

export function loadOrderStickerConfig(): OrderStickerConfig {
  const storage = getStorage();
  if (!storage) {
    return DEFAULT_75X100_CONFIG;
  }
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_75X100_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_75X100_CONFIG,
      ...parsed,
      width: 75, // Always lock default physical dimensions to 75mm
      height: 100, // Always lock default physical dimensions to 100mm
      unit: "mm",
      topOffsetMm: typeof parsed.topOffsetMm === "number" ? parsed.topOffsetMm : 0,
      leftOffsetMm: typeof parsed.leftOffsetMm === "number" ? parsed.leftOffsetMm : 0,
      customDiscountReasons: parsed.customDiscountReasons || {},
    };
  } catch (e) {
    console.error("[OrderStickerConfig] Failed to read config from localStorage:", e);
    return DEFAULT_75X100_CONFIG;
  }
}

export function saveOrderStickerConfig(config: OrderStickerConfig): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("[OrderStickerConfig] Failed to save config to localStorage:", e);
  }
}

export function setCustomDiscountReason(orderId: string, reason: string): OrderStickerConfig {
  const config = loadOrderStickerConfig();
  const updated: OrderStickerConfig = {
    ...config,
    customDiscountReasons: {
      ...config.customDiscountReasons,
      [orderId]: reason,
    },
  };
  saveOrderStickerConfig(updated);
  return updated;
}

export function resetOrderStickerConfig(): OrderStickerConfig {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  return DEFAULT_75X100_CONFIG;
}
