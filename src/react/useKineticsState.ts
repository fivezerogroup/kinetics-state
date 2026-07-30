import { useCallback, useEffect, useRef, useState } from "react";
import { createStorageEngine } from "../factory";
import type {
	KineticsStateMeta,
	KineticsStateOptions,
	StateEngine,
} from "../types";

type SetStateAction<T> = T | ((prev: T) => T);

/**
 * Main `useKineticsState` hook — binds React state to the chosen storage driver.
 *
 * Works just like the standard React `useState`, but the state is automatically
 * synchronized to the URL, IndexedDB, or Memory based on the selected driver.
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
	const [value, setValueInternal] = useState<T>(options.defaultValue);
	const [isSyncing, setIsSyncing] = useState(false);
	const [isHydrated, setIsHydrated] = useState(false);

	// Lazy init engine — created only once
	const engineRef = useRef<StateEngine<T> | null>(null);
	if (engineRef.current === null) {
		engineRef.current = createStorageEngine<T>(options);
	}

	// Mirror the latest value to avoid stale closure in setState
	const valueRef = useRef<T>(options.defaultValue);

	// Ref to options so setState always reads the latest options without needing them as a dependency
	const optionsRef = useRef<KineticsStateOptions<T>>(options);
	useEffect(() => {
		optionsRef.current = options;
	});

	// Debounce timer — stored in a ref so it can be cancelled (cancel on unmount)
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Hydration — read initial value from storage on mount
	useEffect(() => {
		const engine = engineRef.current;
		if (!engine) return;

		const hydrate = async () => {
			const raw = await Promise.resolve(engine.read(key));

			if (raw !== null && raw !== undefined) {
				valueRef.current = raw as T;
				setValueInternal(raw as T);
			}

			setIsHydrated(true);
		};

		void hydrate();

		// Cleanup: cancel any pending debounce when the component unmounts
		return () => {
			if (debounceTimerRef.current !== null) {
				clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
			}
		};
	}, [key]); // Re-hydrate only if the key changes

	// Setter — update React state + write to storage
	const setState = useCallback(
		(action: SetStateAction<T>) => {
			// Resolve new value — support updater function (just like native useState)
			const newValue =
				typeof action === "function"
					? (action as (prev: T) => T)(valueRef.current)
					: action;

			// Update React state and valueRef synchronously (UI is immediately responsive)
			valueRef.current = newValue;
			setValueInternal(newValue);

			// Schedule write to storage
			const opts = optionsRef.current;
			const engine = engineRef.current;
			if (!engine) return;
			const debounceMs = opts.driver === "url" ? (opts.debounceMs ?? 0) : 0;

			// Cancel previous debounce timer (if any)
			if (debounceTimerRef.current !== null) {
				clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
			}

			if (debounceMs > 0) {
				// Debounced Mode (for URL driver)
				setIsSyncing(true);

				debounceTimerRef.current = setTimeout(async () => {
					debounceTimerRef.current = null;
					await Promise.resolve(engine.write(key, newValue, opts));
					setIsSyncing(false);
				}, debounceMs);
			} else {
				// Immediate Mode
				const result = engine.write(key, newValue, opts);

				if (result instanceof Promise) {
					setIsSyncing(true);
					void result.then(() => setIsSyncing(false));
				}
			}
		},
		[key],
	);

	return [value, setState, { isSyncing, isHydrated }];
}
