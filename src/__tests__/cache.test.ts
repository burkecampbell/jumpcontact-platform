import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cached, invalidate, invalidatePrefix, clearAll } from '../lib/cache';

beforeEach(() => {
  clearAll();
});

describe('cached', () => {
  it('calls fn on first access', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    const result = await cached('key1', 10_000, fn);
    expect(result).toBe('data');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('returns cached value on second access', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    await cached('key2', 10_000, fn);
    const result = await cached('key2', 10_000, fn);
    expect(result).toBe('data');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('re-fetches after TTL expires', async () => {
    vi.useFakeTimers();
    const fn = vi.fn()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new');

    await cached('key3', 100, fn);
    vi.advanceTimersByTime(150);
    const result = await cached('key3', 100, fn);
    expect(result).toBe('new');
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('invalidate', () => {
  it('removes a specific cache key', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    await cached('k', 10_000, fn);
    invalidate('k');
    await cached('k', 10_000, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('no-ops for non-existent key', () => {
    expect(() => invalidate('nope')).not.toThrow();
  });
});

describe('invalidatePrefix', () => {
  it('removes all keys with matching prefix', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    await cached('calls:2026-04-01', 10_000, fn);
    await cached('calls:2026-04-02', 10_000, fn);
    await cached('dashboard', 10_000, fn);

    invalidatePrefix('calls:');

    // calls keys should be invalidated
    await cached('calls:2026-04-01', 10_000, fn);
    // 3 original + 1 re-fetch = 4
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('does not affect non-matching keys', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    await cached('dashboard', 10_000, fn);
    invalidatePrefix('calls:');
    await cached('dashboard', 10_000, fn);
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('clearAll', () => {
  it('removes all cached entries', async () => {
    const fn = vi.fn().mockResolvedValue('data');
    await cached('a', 10_000, fn);
    await cached('b', 10_000, fn);
    clearAll();
    await cached('a', 10_000, fn);
    await cached('b', 10_000, fn);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
