import { router } from "@inertiajs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { InertiaAdapter } from "../adapters/InertiaAdapter";
import { StateManager } from "../StateManager";
import type {
	KineticsStateMeta,
	KineticsStateOptions,
	StateLifecycle,
} from "../types";

type SetStateAction<T> = T | ((prev: T) => T);

/**
 * Main `useKineticsState` hook — binds React state to the chosen storage driver.
 *
 * Works just like the standard React `useState`, but the state is automatically
 * synchronized to the URL, IndexedDB, or Memory based on the selected driver.
 *
 * Internally delegates all lifecycle management to `StateManager` — this hook
 * is purely a thin React binding layer (subscribe → render).
 *
 * @template T - The state data type.
 * @param key - Unique key to store the state (must be unique per page/component).
 * @param options - Driver configuration. Type is strictly checked by TypeScript.
 * @returns A tuple `[value, setValue, meta]` — identical to `useState` + a meta object.
 *
 * @example
 * // URL Driver — state synchronized to URL, triggers Inertia request after 500ms
 * const [search, setSearch, { isSyncing }] = useKineticsState('q', {
 *   driver: 'url',
 *   defaultValue: '',
 *   debounceMs: 500,
 *   inertiaOptions: { preserveState: true, only: ['users'] },
 * });
 *
 * @example
 * // IndexedDB Driver — persistent state, survives browser refresh
 * const [columns, setColumns, { isHydrated }] = useKineticsState('user-cols', {
 *   driver: 'indexeddb',
 *   defaultValue: { email: true, phone: false },
 *   storagePrefix: 'user-table',
 * });
 *
 * @example
 * // Memory Driver — temporary state, lost on refresh
 * const [activeTab, setActiveTab] = useKineticsState('active-tab', {
 *   driver: 'memory',
 *   defaultValue: 'overview',
 * });
 */
export function useKineticsState<T>(
	key: string,
	options: KineticsStateOptions<T>,
): [T, (action: SetStateAction<T>) => void, KineticsStateMeta] {
	// Lazy-init StateManager — created only once per key
	const managerRef = useRef<StateManager<T> | null>(null);
	if (managerRef.current === null) {
		managerRef.current = new StateManager(key, options);
	}

	// Ref to always read the latest options inside effects without adding them to deps
	const optionsRef = useRef<KineticsStateOptions<T>>(options);
	optionsRef.current = options;

	// Derive initial UI state from the manager's current values
	const [snapshot, setSnapshot] = useState<{
		value: T;
		lifecycle: StateLifecycle;
	}>(() => ({
		value: managerRef.current?.getValue() ?? options.defaultValue,
		lifecycle: "hydrating",
	}));

	// Mount: subscribe to manager + trigger hydration + register inertia:success re-hydration
	useEffect(() => {
		const manager = managerRef.current;
		if (!manager) return;

		// Subscribe — any state/lifecycle change triggers a React re-render
		const unsubscribe = manager.subscribe((value, lifecycle) => {
			setSnapshot({ value, lifecycle });
		});

		// Trigger initial hydration from storage
		void manager.hydrate();

		// For URL driver: re-hydrate whenever Inertia navigates successfully.
		// This keeps URL state in sync when the user clicks browser Back/Forward.
		let unregisterSuccess: (() => void) | undefined;
		if (optionsRef.current.driver === "url") {
			// Inject the router from the React binding — ensures the same singleton
			// instance is used regardless of how node_modules are resolved.
			InertiaAdapter.setRouter(router);

			unregisterSuccess = InertiaAdapter.getInstance().onSuccess(() => {
				// Only re-hydrate if there's no pending debounce (avoids race conditions)
				if (manager.getLifecycle() !== "syncing") {
					void manager.hydrate();
				}
			});
		}

		return () => {
			unsubscribe();
			unregisterSuccess?.();
			manager.destroy();
		};
	}, []);

	// Stable setter — wraps manager.setValue for React consumers
	const setValue = useCallback((action: SetStateAction<T>) => {
		managerRef.current?.setValue(action);
	}, []);

	return [
		snapshot.value,
		setValue,
		{
			isSyncing: snapshot.lifecycle === "syncing",
			isHydrated: snapshot.lifecycle !== "hydrating",
		},
	];
}
