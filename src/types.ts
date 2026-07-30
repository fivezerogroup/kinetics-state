import type { VisitOptions } from "@inertiajs/core";

// Storage Driver

export type StorageDriver = "url" | "indexeddb" | "memory";

interface BaseOptions<T> {
	defaultValue: T;

	serialize?: (value: T) => string;

	deserialize?: (raw: string) => T;
}

export interface UrlDriverOptions<T> extends BaseOptions<T> {
	driver: "url";

	debounceMs?: number;

	inertiaOptions?: Partial<VisitOptions>;
}

export interface IndexedDbDriverOptions<T> extends BaseOptions<T> {
	driver: "indexeddb";

	storagePrefix?: string;
}

export interface MemoryDriverOptions<T> extends BaseOptions<T> {
	driver: "memory";

	storagePrefix?: string;
}

export type KineticsStateOptions<T> =
	| UrlDriverOptions<T>
	| IndexedDbDriverOptions<T>
	| MemoryDriverOptions<T>;

export interface KineticsStateMeta {
	isSyncing: boolean;

	isHydrated: boolean;
}

export interface StateEngine<T = unknown> {
	/**
	 * Reads a value by key.
	 * Synchronous for MemoryDriver/UrlDriver, asynchronous (Promise) for IndexedDbDriver.
	 */
	read(key: string): T | null | undefined | Promise<T | null | undefined>;

	/**
	 * Writes a value to storage.
	 */
	write(
		key: string,
		value: T,
		options: KineticsStateOptions<T>,
	): void | Promise<void>;

	/**
	 * Removes a value from storage permanently.
	 */
	remove(key: string): void | Promise<void>;
}
