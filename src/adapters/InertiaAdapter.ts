import type { VisitOptions } from "@inertiajs/core";

type HydrationCallback = () => void;

/**
 * Minimal router interface — compatible with both `@inertiajs/react` and `@inertiajs/vue3`.
 * Injected by the framework binding via `InertiaAdapter.setRouter()`.
 */
interface RouterLike {
	visit(url: string, options?: Partial<VisitOptions>): void;
}

/**
 * InertiaAdapter — singleton that bridges kinetics-state with Inertia's lifecycle.
 *
 * Responsibilities:
 * 1. **scheduleVisit()** — debounces and executes `router.visit()` after the URL
 *    driver has silently updated the URL via `history.replaceState()`.
 * 2. **inertia:success** listener — notifies registered URL-driver state managers
 *    to re-hydrate from the new URL after a successful Inertia navigation.
 *
 * Design decisions:
 * - Singleton: only one instance ever exists, shared across all `useKineticsState`
 *   hooks. No manual setup (e.g., `<KineticsProvider>`) needed.
 * - Re-hydration is skipped if a debounce timer is still pending (prevents race
 *   conditions between user input and arriving Inertia responses).
 */
export class InertiaAdapter {
	private static instance: InertiaAdapter | null = null;

	/** Injected by the framework binding (React/Vue). Set via `setRouter()`. */
	private static routerRef: RouterLike | null = null;

	private visitTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingUrl: string | null = null;
	private pendingInertiaOptions: Partial<VisitOptions> | undefined;

	/** Callbacks registered by StateManagers to re-hydrate on inertia:success */
	private readonly hydrationCallbacks: Set<HydrationCallback> = new Set();

	private attached = false;

	// Singleton

	private constructor() {}

	static getInstance(): InertiaAdapter {
		if (!InertiaAdapter.instance) {
			InertiaAdapter.instance = new InertiaAdapter();
			InertiaAdapter.instance.attach();
		}
		return InertiaAdapter.instance;
	}

	/**
	 * Injects the Inertia router from the framework binding.
	 *
	 * Must be called once before any URL-driver state is used:
	 * - React: `InertiaAdapter.setRouter(router)` — router from `@inertiajs/react`
	 * - Vue:   `InertiaAdapter.setRouter(router)` — router from `@inertiajs/vue3`
	 *
	 * This avoids dual-instance issues caused by each package resolving
	 * its own copy of `@inertiajs/core` from node_modules.
	 */
	static setRouter(router: RouterLike): void {
		InertiaAdapter.routerRef = router;
	}

	// Visit Scheduling

	/**
	 * Schedules an Inertia `router.visit()` for the given URL.
	 *
	 * Multiple calls within the same tick are coalesced into a single visit —
	 * this prevents multiple URL-driver writes from firing separate requests.
	 *
	 * @param url - The target URL (already updated by UrlDriver).
	 * @param inertiaOptions - Inertia visit options forwarded from driver config.
	 */
	scheduleVisit(url: string, inertiaOptions?: Partial<VisitOptions>): void {
		this.pendingUrl = url;
		this.pendingInertiaOptions = inertiaOptions;

		// Cancel any queued visit from a previous write in the same tick
		if (this.visitTimer !== null) {
			clearTimeout(this.visitTimer);
		}

		// Use a 0ms timer to coalesce multiple synchronous writes into one visit
		this.visitTimer = setTimeout(() => {
			this.visitTimer = null;
			if (this.pendingUrl === null) return;

			if (InertiaAdapter.routerRef === null) {
				console.warn(
					"[kinetics-state] InertiaAdapter.setRouter() was not called. " +
						"Import and pass the router from your framework binding " +
						"(e.g. `import { router } from '@inertiajs/react'`).",
				);
				return;
			}

			InertiaAdapter.routerRef.visit(this.pendingUrl, {
				preserveState: true,
				preserveScroll: true,
				replace: true,
				...this.pendingInertiaOptions,
			});

			this.pendingUrl = null;
			this.pendingInertiaOptions = undefined;
		}, 0);
	}

	// inertia:success Interception

	/**
	 * Registers a callback to be called after each successful Inertia navigation.
	 * Used by StateManager (url driver) to re-hydrate from the new URL.
	 *
	 * Returns an unregister function.
	 */
	onSuccess(callback: HydrationCallback): () => void {
		this.hydrationCallbacks.add(callback);
		return () => {
			this.hydrationCallbacks.delete(callback);
		};
	}

	// Lifecycle

	/**
	 * Attaches the `inertia:success` DOM event listener.
	 * Called automatically by `getInstance()`.
	 */
	private attach(): void {
		if (this.attached || typeof document === "undefined") return;
		document.addEventListener("inertia:success", this.handleSuccess);
		this.attached = true;
	}

	/**
	 * Removes the `inertia:success` DOM event listener.
	 * Can be called to fully tear down the adapter (e.g., in tests).
	 */
	detach(): void {
		if (!this.attached || typeof document === "undefined") return;
		document.removeEventListener("inertia:success", this.handleSuccess);
		this.attached = false;

		// Also clear any pending visit timer
		if (this.visitTimer !== null) {
			clearTimeout(this.visitTimer);
			this.visitTimer = null;
		}
	}

	/**
	 * Destroys the singleton instance entirely.
	 * Primarily used in tests to reset state between test cases.
	 */
	static reset(): void {
		InertiaAdapter.instance?.detach();
		InertiaAdapter.instance = null;
		InertiaAdapter.routerRef = null;
	}

	// Internals

	private readonly handleSuccess = (): void => {
		for (const callback of this.hydrationCallbacks) {
			callback();
		}
	};
}
