export function createDebounce<TArgs extends unknown[]>(
	fn: (...args: TArgs) => void | Promise<void>,
	wait: number,
): {
	debounced: (...args: TArgs) => void;
	cancel: () => void;
} {
	let timerId: ReturnType<typeof setTimeout> | null = null;

	const debounced = (...args: TArgs): void => {
		if (timerId !== null) {
			clearTimeout(timerId);
		}
		timerId = setTimeout(() => {
			timerId = null;
			void fn(...args);
		}, wait);
	};

	const cancel = (): void => {
		if (timerId !== null) {
			clearTimeout(timerId);
			timerId = null;
		}
	};

	return { debounced, cancel };
}
