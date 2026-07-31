import { InertiaAdapter } from "./adapters/InertiaAdapter";
import { createStorageEngine } from "./factory";
import type {
	KineticsStateOptions,
	StateEngine,
	StateLifecycle,
	StateManagerListener,
} from "./types";

type SetStateAction<T> = T | ((prev: T) => T);

/**
 * StateManager — the framework-agnostic core of kinetics-state.
 *
 * Orchestrates the full state lifecycle:
 *   Init → Hydrate → Change → Sync
 *
 * Inspired by Laravel's Manager pattern: StateManager owns the lifecycle,
 * while StateEngine (the driver) only handles raw read/write/remove operations.
 *
 * - Can be used independently of React (or any UI framework).
 * - Framework bindings (e.g., `useKineticsState`) subscribe via `subscribe()`.
 * - For `url` driver: delegates Inertia navigation to `InertiaAdapter`.
 *
 * @template T - The type of state being managed.
 */
export class StateManager<T> {
	private readonly engine: StateEngine<T>;
	private readonly key: string;
	private readonly options: KineticsStateOptions<T>;

	private currentValue: T;
	private lifecycle: StateLifecycle = "hydrating";
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly listeners: Set<StateManagerListener<T>> = new Set();

	constructor(key: string, options: KineticsStateOptions<T>) {
		this.key = key;
		this.options = options;
		this.currentValue = options.defaultValue;
		this.engine = createStorageEngine(options);
	}

	// Public Getters

	getValue(): T {
		return this.currentValue;
	}

	getLifecycle(): StateLifecycle {
		return this.lifecycle;
	}

	// Hydrate

	/**
	 * Reads the initial value from storage and transitions lifecycle to `idle`.
	 * Called once on mount by the framework binding.
	 */
	async hydrate(): Promise<void> {
		this.setLifecycle("hydrating");

		const raw = await Promise.resolve(this.engine.read(this.key));

		if (raw !== null && raw !== undefined) {
			this.currentValue = raw as T;
		}

		this.setLifecycle("idle");
		this.notifyListeners();
	}

	// Change

	/**
	 * Updates the current value and schedules a sync to storage.
	 * Supports both direct values and updater functions (like React's setState).
	 */
	setValue(action: SetStateAction<T>): void {
		const newValue =
			typeof action === "function"
				? (action as (prev: T) => T)(this.currentValue)
				: action;

		this.currentValue = newValue;

		// Notify listeners immediately so UI is responsive
		this.notifyListeners();

		// Schedule sync to storage
		this.scheduleSync(newValue);
	}

	// Sync

	/**
	 * Schedules a write to the underlying driver.
	 * Applies debounce for `url` driver (configurable via `debounceMs` option).
	 */
	private scheduleSync(value: T): void {
		const debounceMs =
			this.options.driver === "url" ? (this.options.debounceMs ?? 0) : 0;

		// Cancel any pending sync
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		if (debounceMs > 0) {
			this.setLifecycle("syncing");

			this.debounceTimer = setTimeout(() => {
				this.debounceTimer = null;
				void this.doSync(value);
			}, debounceMs);
		} else {
			void this.doSync(value);
		}
	}

	/**
	 * Performs the actual write to storage.
	 * For `url` driver, also triggers an Inertia visit via `InertiaAdapter`.
	 */
	private async doSync(value: T): Promise<void> {
		const result = this.engine.write(this.key, value, this.options);

		if (result instanceof Promise) {
			this.setLifecycle("syncing");
			await result;
		}

		// After URL has been silently updated, schedule the Inertia visit
		if (this.options.driver === "url") {
			InertiaAdapter.getInstance().scheduleVisit(
				window.location.href,
				this.options.inertiaOptions,
			);
		}

		this.setLifecycle("idle");
		this.notifyListeners();
	}

	// Subscription

	/**
	 * Subscribes to state and lifecycle changes.
	 * Returns an unsubscribe function to remove the listener.
	 */
	subscribe(listener: StateManagerListener<T>): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	// Cleanup

	/**
	 * Cancels any pending debounce timers and clears all listeners.
	 * Must be called when the component/consumer is unmounted.
	 */
	destroy(): void {
		if (this.debounceTimer !== null) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.listeners.clear();
	}

	// Internals

	private setLifecycle(next: StateLifecycle): void {
		this.lifecycle = next;
	}

	private notifyListeners(): void {
		for (const listener of this.listeners) {
			listener(this.currentValue, this.lifecycle);
		}
	}
}
