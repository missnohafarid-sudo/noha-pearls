import type { PlatformKv } from '../server/platformKv';

/** The platform's key-value store, kept in memory for a test. */
export function memoryKv(): PlatformKv {
  const kept = new Map<string, unknown>();
  return { get: <T>(key: string) => kept.get(key) as T | undefined, put: <T>(key: string, value: T) => void kept.set(key, value) };
}
