/**
 * In-memory TTL cache for serverless environments.
 *
 * Vercel keeps warm functions alive for ~5-15 min, so an in-memory cache
 * avoids redundant Twilio / Google Sheets API calls within that window.
 *
 * Usage:
 *   const data = await cached('dashboard', 60_000, () => fetchDashboard());
 */

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Return cached data if still valid, otherwise execute `fn` and cache the result.
 *
 * @param key   Unique cache key (e.g. 'dashboard', 'calls:2026-03-09')
 * @param ttlMs Time-to-live in milliseconds
 * @param fn    Async function that produces the data
 */
export function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const existing = store.get(key) as CacheEntry<T> | undefined;
  if (existing && Date.now() < existing.expiry) {
    return Promise.resolve(existing.data);
  }

  return fn().then((data) => {
    store.set(key, { data, expiry: Date.now() + ttlMs });
    return data;
  });
}

/** Invalidate a specific cache key */
export function invalidate(key: string): void {
  store.delete(key);
}

/** Invalidate all keys matching a prefix (e.g. 'calls:' clears all date-specific call caches) */
export function invalidatePrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Clear the entire cache */
export function clearAll(): void {
  store.clear();
}
