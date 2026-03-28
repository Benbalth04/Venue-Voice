/**
 * Module-level in-memory cache for dashboard API responses.
 * Persists across component mount/unmount (SPA page navigations).
 * Entries expire after MAX_AGE_MS.
 */

const MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

export interface CacheEntry<T> {
  data: T;
  fetchedAt: number; // Date.now()
}

const store = new Map<string, CacheEntry<unknown>>();

export function buildCacheKey(
  prefix: string,
  locationIds: string[],
  qrCodeIds: string[],
  dateStart: string,
  dateEnd: string,
): string {
  return [
    prefix,
    [...locationIds].sort().join(","),
    [...qrCodeIds].sort().join(","),
    dateStart,
    dateEnd,
  ].join("|");
}

export function getCache<T>(key: string): CacheEntry<T> | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > MAX_AGE_MS) {
    store.delete(key);
    return null;
  }
  return entry;
}

export function setCache<T>(key: string, data: T): number {
  const fetchedAt = Date.now();
  store.set(key, { data, fetchedAt });
  return fetchedAt;
}

export function deleteCache(key: string): void {
  store.delete(key);
}
