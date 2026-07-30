import { get, set, del } from 'idb-keyval';
import type { KineticsStateOptions, StateEngine } from '../types';

/**
 * IndexedDbDriver — persistent storage based on IndexedDB.
 *
 * - State PERSISTS after browser refresh or when closed.
 * - Operations are ASYNCHRONOUS (Promise-based) because IndexedDB is async.
 * - Uses `idb-keyval` (< 1kb) as a lightweight wrapper for IndexedDB.
 * - Ideal for storing form drafts, table column preferences, or other heavy data.
 *
 * @template T - The type of data being stored.
 */
export class IndexedDbDriver<T = unknown> implements StateEngine<T> {
  private readonly prefix: string;

  constructor(prefix: string = 'kinetics') {
    this.prefix = prefix;
  }

  private buildKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async read(key: string): Promise<T | null> {
    const value = await get<T>(this.buildKey(key));
    // idb-keyval returns `undefined` if the key doesn't exist
    return value !== undefined ? value : null;
  }

  async write(key: string, value: T, _options: KineticsStateOptions<T>): Promise<void> {
    await set(this.buildKey(key), value);
  }

  async remove(key: string): Promise<void> {
    await del(this.buildKey(key));
  }
}
