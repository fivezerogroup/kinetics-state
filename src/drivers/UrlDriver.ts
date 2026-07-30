import { router } from '@inertiajs/core';
import type { KineticsStateOptions, StateEngine, UrlDriverOptions } from '../types';

/**
 * Safe fallback deserializer — attempts JSON.parse, falls back to raw string.
 */
function safeJsonDeserialize<T>(raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

/**
 * UrlDriver — synchronizes state with the URL query string.
 *
 * - State is STORED in the URL (bookmarkable & shareable).
 * - Every write triggers Inertia's `router.visit()` (with debounce from the hook).
 * - Supports custom serialize/deserialize for non-string data types.
 *
 * @template T - The type of data being stored.
 */
export class UrlDriver<T = unknown> implements StateEngine<T> {
  private readonly deserializeFn: (raw: string) => T;

  /**
   * @param deserializeFn - Custom deserializer. Default: JSON.parse with fallback.
   */
  constructor(deserializeFn?: (raw: string) => T) {
    this.deserializeFn = deserializeFn ?? safeJsonDeserialize;
  }

  read(key: string): T | null {
    if (typeof window === 'undefined') return null;

    const params = new URLSearchParams(window.location.search);
    const raw = params.get(key);
    if (raw === null) return null;

    return this.deserializeFn(raw);
  }

  write(key: string, value: T, options: KineticsStateOptions<T>): void {
    if (typeof window === 'undefined') return;
    if (options.driver !== 'url') return;

    const urlOptions = options as UrlDriverOptions<T>;
    const serialize = urlOptions.serialize ?? ((v) => JSON.stringify(v));

    const params = new URLSearchParams(window.location.search);

    // Remove the key from the URL if the value is considered "empty" to keep the URL clean.
    // The check is performed on the original value (before serialization) because JSON.stringify('')
    // produces '""' instead of an empty string.
    const isEmpty = value === null || value === undefined || value === '';
    if (isEmpty) {
      params.delete(key);
    } else {
      params.set(key, serialize(value));
    }

    const queryString = params.toString();
    const newUrl = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;

    router.visit(newUrl, {
      preserveState: true,
      preserveScroll: true,
      replace: true,
      ...urlOptions.inertiaOptions,
    });
  }

  remove(key: string): void {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    params.delete(key);

    const queryString = params.toString();
    const newUrl = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;

    router.visit(newUrl, {
      preserveState: true,
      preserveScroll: true,
      replace: true,
    });
  }
}
