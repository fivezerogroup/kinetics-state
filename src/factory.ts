import type { KineticsStateOptions, StateEngine } from './types';
import { MemoryDriver } from './drivers/MemoryDriver';
import { UrlDriver } from './drivers/UrlDriver';
import { IndexedDbDriver } from './drivers/IndexedDbDriver';

/**
 * Factory function that creates the appropriate driver instance
 * based on the `driver` configuration inside `options`.
 *
 * This pattern ensures the Core Hook doesn't need to use `if/switch`
 * directly — just call the factory and the driver is ready to use.
 *
 * @template T - The type of data to be stored by the driver.
 * @param options - Driver configuration (discriminated union).
 * @returns The corresponding StateEngine instance.
 *
 * @example
 * const engine = createStorageEngine({ driver: 'url', defaultValue: '' });
 * const engine = createStorageEngine({ driver: 'indexeddb', defaultValue: {}, storagePrefix: 'user-table' });
 * const engine = createStorageEngine({ driver: 'memory', defaultValue: [] });
 */
export function createStorageEngine<T>(options: KineticsStateOptions<T>): StateEngine<T> {
  switch (options.driver) {
    case 'url':
      // Pass the custom deserializer to UrlDriver so read() can convert string to T
      return new UrlDriver<T>(options.deserialize);

    case 'indexeddb':
      return new IndexedDbDriver<T>(options.storagePrefix);

    case 'memory':
      return new MemoryDriver<T>(options.storagePrefix);

    default: {
      // Exhaustive check — TypeScript will throw an error here if a new driver
      // is added but not handled, forcing the developer to update this factory.
      const _exhaustiveCheck: never = options;
      throw new Error(
        `[kinetics-state] Unknown driver: "${(_exhaustiveCheck as { driver: string }).driver}". ` +
        `Available drivers: 'url', 'indexeddb', 'memory'.`
      );
    }
  }
}
