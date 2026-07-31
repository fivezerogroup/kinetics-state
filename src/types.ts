import type { VisitOptions } from "@inertiajs/core";

// Storage Driver

export type StorageDriver = "url" | "indexeddb" | "memory";

// State Lifecycle

/**
 * Represents the current lifecycle phase of a managed state:
 * - `hydrating` — initial read from storage (on mount)
 * - `syncing`   — write to storage is in-flight or debounced
 * - `idle`      — stable, no pending I/O
 */
export type StateLifecycle = "hydrating" | "syncing" | "idle";

/**
 * Callback fired by StateManager whenever the value or lifecycle changes.
 * Used by framework bindings (e.g., React hook) to trigger re-renders.
 */
export type StateManagerListener<T> = (
	value: T,
	lifecycle: StateLifecycle,
) => void;

// Driver Options

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

// State Meta (public API surface)

export interface KineticsStateMeta {
	isSyncing: boolean;

	isHydrated: boolean;
}

// Driver Interface (StateEngine)

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
