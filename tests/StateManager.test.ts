import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateManager } from "../src/StateManager";

// Mock InertiaAdapter — we don't want real Inertia calls in unit tests
vi.mock("../src/adapters/InertiaAdapter", () => ({
	InertiaAdapter: {
		getInstance: vi.fn(() => ({
			scheduleVisit: vi.fn(),
			onSuccess: vi.fn(() => vi.fn()), // returns unsubscribe fn
		})),
	},
}));

// Mock @inertiajs/core — UrlDriver indirectly requires it (but won't call visit)
vi.mock("@inertiajs/core", () => ({
	router: { visit: vi.fn() },
}));

describe("StateManager", () => {
	beforeEach(() => {
		window.history.replaceState({}, "", "/");
	});

	afterEach(() => {
		vi.clearAllTimers();
	});

	// Init

	describe("Init", () => {
		it("harus diinisialisasi dengan defaultValue", () => {
			const manager = new StateManager("q", {
				driver: "memory",
				defaultValue: "initial",
			});

			expect(manager.getValue()).toBe("initial");
		});

		it("harus dimulai dengan lifecycle 'hydrating'", () => {
			const manager = new StateManager("q", {
				driver: "memory",
				defaultValue: "",
			});

			// Before hydrate() is called, lifecycle should be hydrating
			expect(manager.getLifecycle()).toBe("hydrating");
		});
	});

	// Hydrate

	describe("hydrate()", () => {
		it("harus membaca nilai dari storage dan transisi ke 'idle'", async () => {
			const manager = new StateManager("tab", {
				driver: "memory",
				defaultValue: "overview",
			});

			// Pre-populate memory store via setValue (write first)
			manager.setValue("settings");

			// Create fresh manager to simulate mount
			const manager2 = new StateManager("tab", {
				driver: "memory",
				defaultValue: "overview",
			});

			await manager2.hydrate();

			expect(manager2.getValue()).toBe("settings");
			expect(manager2.getLifecycle()).toBe("idle");
		});

		it("harus menggunakan defaultValue jika storage kosong", async () => {
			const manager = new StateManager("nonexistent-key-xyz", {
				driver: "memory",
				defaultValue: 42,
			});

			await manager.hydrate();

			expect(manager.getValue()).toBe(42);
			expect(manager.getLifecycle()).toBe("idle");
		});

		it("harus memanggil listener setelah hydrate selesai", async () => {
			const manager = new StateManager("q", {
				driver: "memory",
				defaultValue: "",
			});
			const listener = vi.fn();
			manager.subscribe(listener);

			await manager.hydrate();

			expect(listener).toHaveBeenCalledWith("", "idle");
		});
	});

	// Change

	describe("setValue()", () => {
		it("harus mengupdate value dan memanggil listener segera", () => {
			const manager = new StateManager("q", {
				driver: "memory",
				defaultValue: "",
			});
			const listener = vi.fn();
			manager.subscribe(listener);

			manager.setValue("hello");

			expect(manager.getValue()).toBe("hello");
			expect(listener).toHaveBeenCalledWith("hello", expect.any(String));
		});

		it("harus mendukung updater function (seperti React setState)", () => {
			const manager = new StateManager("count", {
				driver: "memory",
				defaultValue: 0,
			});

			manager.setValue((prev) => prev + 1);
			manager.setValue((prev) => prev + 1);

			expect(manager.getValue()).toBe(2);
		});
	});

	// Subscribe

	describe("subscribe()", () => {
		it("harus mengembalikan fungsi unsubscribe yang berfungsi", () => {
			const manager = new StateManager("q", {
				driver: "memory",
				defaultValue: "",
			});
			const listener = vi.fn();

			const unsubscribe = manager.subscribe(listener);
			unsubscribe(); // Unsubscribe sebelum setValue

			manager.setValue("test");

			expect(listener).not.toHaveBeenCalled();
		});

		it("harus mendukung multiple listeners", () => {
			const manager = new StateManager("q", {
				driver: "memory",
				defaultValue: "",
			});
			const listenerA = vi.fn();
			const listenerB = vi.fn();
			manager.subscribe(listenerA);
			manager.subscribe(listenerB);

			manager.setValue("hello");

			expect(listenerA).toHaveBeenCalled();
			expect(listenerB).toHaveBeenCalled();
		});
	});

	// Destroy

	describe("destroy()", () => {
		it("harus membersihkan semua listeners", () => {
			const manager = new StateManager("q", {
				driver: "memory",
				defaultValue: "",
			});
			const listener = vi.fn();
			manager.subscribe(listener);

			manager.destroy();
			manager.setValue("after-destroy"); // Ini tidak boleh memanggil listener

			// Listener tidak seharusnya dipanggil setelah destroy
			// (listeners di-clear, tapi value berubah — ini behavior yang diharapkan)
			expect(listener).not.toHaveBeenCalled();
		});

		it("harus membatalkan debounce timer yang pending saat destroy", () => {
			vi.useFakeTimers();

			const manager = new StateManager("q", {
				driver: "url",
				defaultValue: "",
				debounceMs: 500,
			});

			manager.setValue("test");
			manager.destroy(); // Harus cancel debounce

			// Timer seharusnya tidak fire setelah destroy
			vi.advanceTimersByTime(1000);

			vi.useRealTimers();
		});
	});

	// URL Driver + Debounce

	describe("URL Driver + InertiaAdapter", () => {
		it("harus masuk ke lifecycle 'syncing' saat debounce aktif", () => {
			vi.useFakeTimers();

			const manager = new StateManager("q", {
				driver: "url",
				defaultValue: "",
				debounceMs: 300,
			});
			const listener = vi.fn();
			manager.subscribe(listener);

			manager.setValue("typing...");

			// Segera setelah setValue, lifecycle harus 'syncing'
			expect(manager.getLifecycle()).toBe("syncing");

			vi.useRealTimers();
		});
	});
});
