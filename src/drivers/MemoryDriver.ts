import type { KineticsStateOptions, StateEngine } from "../types";

/**
 * Singleton store shared among all MemoryDriver instances.
 * Uses `Map` for O(1) performance on read/write/delete.
 *
 */
const globalMemoryStore = new Map<string, unknown>();

/**
 * MemoryDriver — temporary storage in JS runtime.
 *
 * - State is LOST when the page is refreshed.
 * - Operations are synchronous (no I/O).
 * - Ideal for temporary UI state (e.g., active filters, selected tabs).
 *
 * @template T - The type of data being stored.
 */
export class MemoryDriver<T = unknown> implements StateEngine<T> {
	private readonly prefix: string;

	constructor(prefix: string = "kinetics") {
		this.prefix = prefix;
	}

	private buildKey(key: string): string {
		return `${this.prefix}:${key}`;
	}

	read(key: string): T | null {
		const fullKey = this.buildKey(key);
		if (!globalMemoryStore.has(fullKey)) return null;
		return globalMemoryStore.get(fullKey) as T;
	}

	write(key: string, value: T, _options: KineticsStateOptions<T>): void {
		globalMemoryStore.set(this.buildKey(key), value);
	}

	remove(key: string): void {
		globalMemoryStore.delete(this.buildKey(key));
	}
}
