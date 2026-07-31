# kinetics-state

> **The missing reactive state foundation for [Inertia.js](https://inertiajs.com/)**

`kinetics-state` is a lightweight TypeScript library that bridges the gap between React's local component state and persistent/shareable storage — designed specifically for Inertia.js applications. Write state the same way you use `useState`, and choose where it lives: in the URL, in IndexedDB, or only in memory.

[![npm version](https://img.shields.io/npm/v/@fivezerogroup/kinetics-state)](https://www.npmjs.com/package/@fivezerogroup/kinetics-state)
[![license](https://img.shields.io/npm/l/@fivezerogroup/kinetics-state)](./LICENSE)
[![peerDependencies](https://img.shields.io/npm/dependency-version/@fivezerogroup/kinetics-state/peer/react)](https://www.npmjs.com/package/react)

---

## Table of Contents

- [Why kinetics-state?](#why-kinetics-state)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [Drivers](#drivers)
  - [URL Driver](#url-driver)
  - [IndexedDB Driver](#indexeddb-driver)
  - [Memory Driver](#memory-driver)
  - [Driver Comparison](#driver-comparison)
- [API Reference](#api-reference)
  - [`useKineticsState`](#usekineticsstatekey-options)
  - [`StateManager`](#statemanager)
  - [`InertiaAdapter`](#inertiaadapter)
  - [`createStorageEngine`](#createstorageengineoptions)
  - [Types](#types)
- [Advanced Usage](#advanced-usage)
  - [Custom Serialization](#custom-serialization)
  - [Inertia Partial Reloads](#inertia-partial-reloads)
  - [Hydration Guard](#hydration-guard)
  - [Loading Indicator with isSyncing](#loading-indicator-with-issyncing)
  - [Using StateManager without React](#using-statemanager-without-react)
  - [Building a Custom Driver](#building-a-custom-driver)
- [Contributing](#contributing)
- [License](#license)

---

## Why kinetics-state?

In Inertia.js apps, managing state that needs to live beyond a single component render is painful:

| Problem | Typical workaround | kinetics-state solution |
|---|---|---|
| Shareable search/filter state | Manually sync with `router.visit()` + `URLSearchParams` | `driver: 'url'` — automatic |
| Persist table column visibility across refreshes | `localStorage` + manual JSON parse/stringify | `driver: 'indexeddb'` — automatic |
| Cross-component ephemeral state | React Context / Zustand / extra boilerplate | `driver: 'memory'` — automatic |

`kinetics-state` gives you one unified hook — `useKineticsState` — that works exactly like `useState` but handles all the sync logic behind the scenes.

---

## Architecture

kinetics-state is built around three distinct layers, inspired by Laravel's Manager pattern:

```
useKineticsState (React hook)
        │ subscribe / setValue
        ▼
   StateManager  // framework-agnostic core
   Init → Hydrate → Change → Sync
        │                      │
        │ read / write         │ scheduleVisit (url driver only)
        ▼                      ▼
   StateEngine              InertiaAdapter (singleton)
   UrlDriver                router.visit() + inertia:success
   IndexedDbDriver
   MemoryDriver
```

| Layer | Responsibility |
|---|---|
| **StateEngine** (drivers) | Pure storage — only read, write, remove. No framework dependency. |
| **StateManager** | Lifecycle orchestrator — owns Init → Hydrate → Change → Sync. Framework-agnostic. |
| **InertiaAdapter** | Singleton interceptor — bridges URL driver writes with `router.visit()` and re-hydrates state on `inertia:success`. |
| **useKineticsState** | Thin React binding — subscribes to `StateManager` and triggers re-renders. |

> This separation means `StateManager` can be used standalone (without React), and drivers can be tested in complete isolation from Inertia.

---

## Installation

```bash
# pnpm (recommended)
pnpm add @fivezerogroup/kinetics-state

# npm
npm install @fivezerogroup/kinetics-state

# yarn
yarn add @fivezerogroup/kinetics-state
```

### Peer Dependencies

Make sure these are installed in your project:

```bash
pnpm add react @inertiajs/react @inertiajs/core
```

| Dependency | Version |
|---|---|
| `react` | `^18.0.0 \|\| ^19.0.0` |
| `@inertiajs/react` | `^2.0.0 \|\| ^3.0.0` |
| `@inertiajs/core` | `^2.0.0 \|\| ^3.0.0` |

---

## Quick Start

```tsx
import { useKineticsState } from '@fivezerogroup/kinetics-state';

function UserTable() {
  // State lives in the URL: /users?search=Alice
  const [search, setSearch] = useKineticsState('search', {
    driver: 'url',
    defaultValue: '',
    debounceMs: 500,
  });

  return (
    <input
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="Search users..."
    />
  );
}
```

The URL is automatically updated after 500ms of inactivity. No extra `useEffect`, no manual `router.visit()`.

---

## Drivers

### URL Driver

Synchronizes state with the browser's URL query string. Ideal for **searchable, filterable, and paginated data** — the URL stays bookmarkable and shareable.

**How it works:**
- On mount, reads the initial value from the current URL's query string.
- On every state update, `UrlDriver` silently updates the URL via `history.replaceState()` — it does **not** call `router.visit()` directly.
- `InertiaAdapter` (singleton) intercepts the update and schedules a single debounced `router.visit()`, coalescing multiple simultaneous URL state writes into one request.
- On `inertia:success`, `InertiaAdapter` notifies registered URL state managers to re-hydrate from the new URL — keeping state in sync on browser Back/Forward navigation.
- Supports optional **debounce** (`debounceMs`) to control how long to wait before the Inertia request fires.
- Empty values (`null`, `undefined`, `""`) are automatically removed from the URL.

```tsx
const [search, setSearch, { isSyncing }] = useKineticsState('q', {
  driver: 'url',
  defaultValue: '',
  debounceMs: 500, // Waits 500ms before navigating
  inertiaOptions: {
    preserveState: true,
    only: ['users'], // Partial reload — only refetch 'users'
  },
});
```

**URL before:** `/users`
**URL after `setSearch('Alice')`:** `/users?q=%22Alice%22`

---

### IndexedDB Driver

Persists state in the browser's IndexedDB. Ideal for **user preferences and form drafts** — state survives page refreshes and browser restarts.

**How it works:**
- Uses [`idb-keyval`](https://github.com/jakearchibald/idb-keyval) (< 1kb) as a thin wrapper around IndexedDB.
- All operations are **asynchronous**. The hook handles this automatically: UI renders immediately with `defaultValue` and updates once the value is hydrated from IndexedDB.
- Use `isHydrated` to guard against rendering stale UI before data is loaded.

```tsx
const [columns, setColumns, { isHydrated }] = useKineticsState('visible-cols', {
  driver: 'indexeddb',
  defaultValue: { name: true, email: true, phone: false },
  storagePrefix: 'user-table',              // Namespaced as "user-table:visible-cols"
});

if (!isHydrated) return <Skeleton />;

return <ColumnToggle columns={columns} onChange={setColumns} />;
```

---

### Memory Driver

Stores state in JavaScript's runtime memory (a module-level `Map`). Ideal for **ephemeral cross-component state** — fast and synchronous, but state is lost on page refresh.

**How it works:**
- Uses a singleton `Map` shared across all `MemoryDriver` instances in the same JS runtime.
- All operations are **synchronous** with O(1) performance.
- Useful for temporary UI state like active tabs, open modals, or in-progress filter selections.

```tsx
const [activeTab, setActiveTab] = useKineticsState('dashboard-tab', {
  driver: 'memory',
  defaultValue: 'overview',
  storagePrefix: 'dashboard',               // Namespaced as "dashboard:dashboard-tab"
});

return (
  <Tabs value={activeTab} onValueChange={setActiveTab}>
    <Tab value="overview">Overview</Tab>
    <Tab value="analytics">Analytics</Tab>
  </Tabs>
);
```

---

### Driver Comparison

| Feature | `url` | `indexeddb` | `memory` |
|---|:---:|:---:|:---:|
| Persists on refresh | ❌ | ✅ | ❌ |
| Shareable via URL | ✅ | ❌ | ❌ |
| Sync / Async | Sync | **Async** | Sync |
| Triggers Inertia visit | ✅ | ❌ | ❌ |
| Supports debounce | ✅ | ❌ | ❌ |
| Cross-component sharing | Via URL | Via key name | Via key name |
| Best for | Search, filters, pagination | Column prefs, drafts | Active tabs, open panels |

---

## API Reference

### `useKineticsState(key, options)`

The main React hook. Works like `useState` but backed by a storage driver.

```ts
function useKineticsState<T>(
  key: string,
  options: KineticsStateOptions<T>,
): [T, (action: T | ((prev: T) => T)) => void, KineticsStateMeta]
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `key` | `string` | Unique storage key. Must be unique per driver scope per page. |
| `options` | `KineticsStateOptions<T>` | Driver configuration (see [Types](#types)). |

**Returns:** `[value, setValue, meta]`

| Return value | Type | Description |
|---|---|---|
| `value` | `T` | Current state value. |
| `setValue` | `(action: T \| ((prev: T) => T)) => void` | Setter — supports both direct value and updater function, identical to React's `useState`. |
| `meta.isSyncing` | `boolean` | `true` while a debounced write or async write is in progress. |
| `meta.isHydrated` | `boolean` | `true` after the initial value has been read from storage on mount. Always `true` immediately for synchronous drivers (`url`, `memory`). |

---

### `StateManager`

The framework-agnostic core engine. Orchestrates the full state lifecycle and notifies subscribers (e.g., React hooks) on every change.

```ts
class StateManager<T> {
  constructor(key: string, options: KineticsStateOptions<T>)

  // Lifecycle
  hydrate(): Promise<void>  // Read initial value from storage
  setValue(action: T | ((prev: T) => T)): void  // Update value + schedule sync
  destroy(): void  // Cancel timers and clear listeners

  // Getters
  getValue(): T
  getLifecycle(): StateLifecycle // 'hydrating' | 'syncing' | 'idle'

  // Subscription
  subscribe(listener: StateManagerListener<T>): () => void  // Returns unsubscribe fn
}
```

See [Using StateManager without React](#using-statemanager-without-react) for a standalone usage example.

---

### `InertiaAdapter`

A singleton that bridges `UrlDriver` writes with Inertia's navigation lifecycle. Attached automatically the first time a `url` driver state is initialized — no manual setup required.

```ts
class InertiaAdapter {
  static getInstance(): InertiaAdapter   // Returns (or creates) the singleton
  static reset(): void  // Tears down the singleton (useful in tests)

  // Schedule a router.visit() after UrlDriver writes to the URL.
  // Multiple calls in the same tick are coalesced into a single visit.
  scheduleVisit(url: string, inertiaOptions?: Partial<VisitOptions>): void

  // Register a callback to re-hydrate state after inertia:success.
  // Returns an unregister function.
  onSuccess(callback: () => void): () => void

  detach(): void   // Remove the inertia:success event listener
}
```

**Visit Coalescing:** If multiple `url` driver states update within the same synchronous tick, `InertiaAdapter` fires only **one** `router.visit()` — not one per state change. This prevents unnecessary network requests.

---

### `createStorageEngine(options)`

Factory function that instantiates the appropriate driver class based on `options.driver`. Used internally by `StateManager` but available for advanced use cases.

```ts
function createStorageEngine<T>(options: KineticsStateOptions<T>): StateEngine<T>
```

**Example:**

```ts
import { createStorageEngine } from '@fivezerogroup/kinetics-state';

const engine = createStorageEngine({ driver: 'memory', defaultValue: '' });
engine.write('my-key', 'hello', { driver: 'memory', defaultValue: '' });
const value = engine.read('my-key'); // 'hello'
```

---

### Types

#### `KineticsStateOptions<T>`

A discriminated union. TypeScript enforces correct options per driver.

```ts
type KineticsStateOptions<T> =
  | UrlDriverOptions<T>
  | IndexedDbDriverOptions<T>
  | MemoryDriverOptions<T>;
```

#### `UrlDriverOptions<T>`

```ts
interface UrlDriverOptions<T> {
  driver: 'url';

  /** Initial value when the key is absent from the URL. */
  defaultValue: T;

  /** Delay (ms) before triggering Inertia's router.visit(). Default: 0 (immediate). */
  debounceMs?: number;

  /** Options forwarded directly to Inertia's router.visit(). */
  inertiaOptions?: Partial<VisitOptions>;

  /** Custom serializer: converts T → string for the URL. Default: JSON.stringify. */
  serialize?: (value: T) => string;

  /** Custom deserializer: converts URL string → T. Default: JSON.parse with fallback. */
  deserialize?: (raw: string) => T;
}
```

#### `IndexedDbDriverOptions<T>`

```ts
interface IndexedDbDriverOptions<T> {
  driver: 'indexeddb';

  /** Initial value while the async read from IndexedDB is in progress. */
  defaultValue: T;

  /** Prefix for the IndexedDB key. Default: 'kinetics'. Key is stored as `{prefix}:{key}`. */
  storagePrefix?: string;

  /** Custom serializer (not used by IndexedDB driver — values are stored as-is). */
  serialize?: (value: T) => string;

  /** Custom deserializer (not used by IndexedDB driver — values are stored as-is). */
  deserialize?: (raw: string) => T;
}
```

#### `MemoryDriverOptions<T>`

```ts
interface MemoryDriverOptions<T> {
  driver: 'memory';

  /** Initial value when key is not yet in the in-memory store. */
  defaultValue: T;

  /** Prefix for the memory key. Default: 'kinetics'. Key is stored as `{prefix}:{key}`. */
  storagePrefix?: string;
}
```

#### `KineticsStateMeta`

```ts
interface KineticsStateMeta {
  /** True while a debounced or async write is pending. */
  isSyncing: boolean;

  /** True after initial storage read completes on mount. */
  isHydrated: boolean;
}
```

#### `StateLifecycle`

Represents the current phase of a `StateManager`'s lifecycle.

```ts
type StateLifecycle = 'hydrating' | 'syncing' | 'idle';
//                     ↑ on mount    ↑ writing    ↑ stable
```

#### `StateManagerListener<T>`

Callback type for subscribing to `StateManager` changes.

```ts
type StateManagerListener<T> = (value: T, lifecycle: StateLifecycle) => void;
```

#### `StateEngine<T>`

The contract that all drivers implement. You can implement your own driver by satisfying this interface.

```ts
interface StateEngine<T = unknown> {
  read(key: string): T | null | undefined | Promise<T | null | undefined>;
  write(key: string, value: T, options: KineticsStateOptions<T>): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}
```

---

## Advanced Usage

### Custom Serialization

By default, the URL driver serializes values with `JSON.stringify` and deserializes with `JSON.parse`. For complex types or more readable URLs, you can provide custom serializer/deserializer functions.

```tsx
// Storing an array as a comma-separated list instead of JSON
const [tags, setTags] = useKineticsState('tags', {
  driver: 'url',
  defaultValue: [] as string[],
  serialize: (v) => v.join(','),
  deserialize: (raw) => raw.split(',').filter(Boolean),
});
// URL: /posts?tags=react,typescript,inertia
```

---

### Inertia Partial Reloads

To avoid re-fetching the entire page on every keystroke, use Inertia's [partial reloads](https://inertiajs.com/partial-reloads) via `inertiaOptions.only`:

```tsx
const [search, setSearch, { isSyncing }] = useKineticsState('search', {
  driver: 'url',
  defaultValue: '',
  debounceMs: 400,
  inertiaOptions: {
    preserveState: true,
    preserveScroll: true,
    only: ['users'], // Only the 'users' prop is re-fetched from the server
  },
});
```

---

### Hydration Guard

The `isHydrated` flag is `false` until the initial storage read completes. For IndexedDB (async), this is important to avoid rendering a blank table before data loads.

```tsx
function UserTable() {
  const [columns, setColumns, { isHydrated }] = useKineticsState('cols', {
    driver: 'indexeddb',
    defaultValue: defaultColumns,
  });

  // Show a skeleton until IndexedDB has resolved
  if (!isHydrated) {
    return <TableSkeleton />;
  }

  return <DataTable columns={columns} />;
}
```

> **Note:** For `url` and `memory` drivers, `isHydrated` becomes `true` on the very first render since both reads are synchronous.

---

### Loading Indicator with `isSyncing`

Use `isSyncing` to show a spinner while a debounced URL update or async IndexedDB write is pending:

```tsx
const [search, setSearch, { isSyncing }] = useKineticsState('q', {
  driver: 'url',
  defaultValue: '',
  debounceMs: 600,
});

return (
  <div className="relative">
    <input value={search} onChange={(e) => setSearch(e.target.value)} />
    {isSyncing && <Spinner className="absolute right-2 top-2" />}
  </div>
);
```

---

### Using StateManager without React

`StateManager` is framework-agnostic — you can use it in any JavaScript environment (Vue, Svelte, vanilla JS, Node.js scripts, etc.):

```ts
import { StateManager } from '@fivezerogroup/kinetics-state';

const manager = new StateManager('search', {
  driver: 'memory',
  defaultValue: '',
});

// Subscribe to changes
const unsubscribe = manager.subscribe((value, lifecycle) => {
  console.log('State changed:', value, '| Lifecycle:', lifecycle);
});

// Hydrate from storage
await manager.hydrate();

// Update state
manager.setValue('Alice');           // Direct value
manager.setValue((prev) => prev + '!'); // Updater function

// Cleanup
unsubscribe();
manager.destroy();
```

---

### Building a Custom Driver

You can extend the library with a custom driver by implementing the `StateEngine<T>` interface:

```ts
import type { StateEngine, KineticsStateOptions } from '@fivezerogroup/kinetics-state';

class SessionStorageDriver<T> implements StateEngine<T> {
  read(key: string): T | null {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  }

  write(key: string, value: T, _options: KineticsStateOptions<T>): void {
    sessionStorage.setItem(key, JSON.stringify(value));
  }

  remove(key: string): void {
    sessionStorage.removeItem(key);
  }
}
```

Pair it with `StateManager` directly to get the full lifecycle for free:

```ts
import { StateManager } from '@fivezerogroup/kinetics-state';

// Use any StateEngine-compatible driver with StateManager
const manager = new StateManager('key', { driver: 'memory', defaultValue: '' });
// Override the internal engine if needed for advanced use cases
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository and create your branch from `main`.
2. Install dependencies: `pnpm install`
3. Make your changes.
4. Run the tests: `pnpm test`
5. Lint and format: `pnpm lint`
6. Commit using the conventional changelog format: `pnpm commit`
7. Open a pull request.

### Scripts

| Script | Description |
|---|---|
| `pnpm build` | Build the production bundle (via `tsup`) |
| `pnpm dev` | Build in watch mode |
| `pnpm test` | Run tests once (via `vitest`) |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Lint and auto-fix (via `biome`) |
| `pnpm format` | Format code (via `biome`) |
| `pnpm commit` | Interactive conventional commit (via `commitizen`) |

---

## License

MIT © [fivezerogroup](https://github.com/fivezerogroup)
