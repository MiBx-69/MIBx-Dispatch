export interface PathaoStore {
  store_id: number;
  store_name: string;
  store_address: string;
  is_default_store?: boolean;
  is_default_return_store?: boolean;
  is_active?: number;
}

const STORAGE_KEY_COUNTS = "pathao_store_usage_counts";
const STORAGE_KEY_LAST_USED = "pathao_last_used_store_id";

/**
 * Retrieves the store usage frequency counts from localStorage.
 * Format: { [store_id]: count }
 */
export function getStoreUsageCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COUNTS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Returns the most frequently used store ID based on recorded history.
 */
export function getMostFrequentStoreId(stores?: PathaoStore[]): string | null {
  if (typeof window === "undefined") return null;
  const counts = getStoreUsageCounts();
  let maxCount = 0;
  let mostFrequentId: string | null = null;

  if (stores && stores.length > 0) {
    for (const store of stores) {
      const count = counts[String(store.store_id)] || 0;
      if (count > maxCount) {
        maxCount = count;
        mostFrequentId = String(store.store_id);
      }
    }
  } else {
    for (const [id, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        mostFrequentId = id;
      }
    }
  }

  return mostFrequentId;
}

/**
 * Gets an immediate initial store ID before remote store lists load.
 * Priority: Most frequently used -> Last used store -> Server prop default.
 */
export function getInitialStoreId(propStoreId?: number | string | null): string {
  if (typeof window !== "undefined") {
    const mostFrequent = getMostFrequentStoreId();
    if (mostFrequent) return mostFrequent;

    const lastUsed = localStorage.getItem(STORAGE_KEY_LAST_USED);
    if (lastUsed) return lastUsed;
  }
  return propStoreId ? String(propStoreId) : "";
}

/**
 * Resolves the optimal default store ID given a loaded list of stores.
 * Priority:
 * 1. Current value if already a valid loaded store
 * 2. Most frequently used store in local history
 * 3. Last used store in local history
 * 4. Server configured default store (propStoreId)
 * 5. Pathao's official default store (is_default_store: true)
 * 6. First store in the list
 */
export function resolveDefaultStoreId({
  stores,
  propStoreId,
  currentValue,
}: {
  stores: PathaoStore[];
  propStoreId?: number | string | null;
  currentValue?: string;
}): string {
  if (!stores || stores.length === 0) {
    return currentValue || (propStoreId ? String(propStoreId) : "");
  }

  // 1. If currentValue is already valid in the loaded list, retain it
  if (currentValue && stores.some((s) => String(s.store_id) === String(currentValue))) {
    return String(currentValue);
  }

  // 2. Most frequently used store in list
  const mostFrequent = getMostFrequentStoreId(stores);
  if (mostFrequent && stores.some((s) => String(s.store_id) === mostFrequent)) {
    return mostFrequent;
  }

  // 3. Last used store in localStorage
  if (typeof window !== "undefined") {
    const lastUsed = localStorage.getItem(STORAGE_KEY_LAST_USED);
    if (lastUsed && stores.some((s) => String(s.store_id) === lastUsed)) {
      return lastUsed;
    }
  }

  // 4. Server-provided default store
  if (propStoreId && stores.some((s) => String(s.store_id) === String(propStoreId))) {
    return String(propStoreId);
  }

  // 5. Store flagged as default in Pathao account
  const defaultStore = stores.find((s) => s.is_default_store);
  if (defaultStore) {
    return String(defaultStore.store_id);
  }

  // 6. First available store
  return String(stores[0].store_id);
}

/**
 * Records that a store was used to dispatch one or more orders.
 * Increments frequency count and marks as last used.
 * Also asynchronously syncs default store to backend settings.
 */
export function recordStoreUsage(storeId: number | string, count: number = 1): void {
  if (typeof window === "undefined" || !storeId) return;
  const sId = String(storeId);

  try {
    const counts = getStoreUsageCounts();
    counts[sId] = (counts[sId] || 0) + (count > 0 ? count : 1);
    localStorage.setItem(STORAGE_KEY_COUNTS, JSON.stringify(counts));
    localStorage.setItem(STORAGE_KEY_LAST_USED, sId);

    // Sync to backend default store endpoint in the background (fire & forget)
    fetch("/api/pathao/stores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ default_store_id: parseInt(sId, 10) }),
    }).catch(() => {});
  } catch (err) {
    console.error("Failed to record store usage:", err);
  }
}
