import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InertiaAdapter } from "../src/adapters/InertiaAdapter";

// Mock @inertiajs/core
vi.mock("@inertiajs/core", () => ({
	router: {
		visit: vi.fn(),
	},
}));

import { router } from "@inertiajs/core";

describe("InertiaAdapter", () => {
	beforeEach(() => {
		// Reset singleton between tests
		InertiaAdapter.reset();
		vi.mocked(router.visit).mockClear();
	});

	afterEach(() => {
		InertiaAdapter.reset();
		vi.clearAllTimers();
	});

	// Singleton

	describe("getInstance()", () => {
		it("harus mengembalikan instance yang sama (singleton)", () => {
			const a = InertiaAdapter.getInstance();
			const b = InertiaAdapter.getInstance();
			expect(a).toBe(b);
		});
	});

	// scheduleVisit

	describe("scheduleVisit()", () => {
		it("harus memanggil router.visit() setelah 0ms timer", async () => {
			vi.useFakeTimers();

			const adapter = InertiaAdapter.getInstance();
			adapter.scheduleVisit("http://localhost/?q=test");

			// Belum dipanggil sebelum timer fire
			expect(router.visit).not.toHaveBeenCalled();

			vi.advanceTimersByTime(0);
			await Promise.resolve(); // flush microtasks

			expect(router.visit).toHaveBeenCalledWith(
				"http://localhost/?q=test",
				expect.objectContaining({
					preserveState: true,
					preserveScroll: true,
					replace: true,
				}),
			);

			vi.useRealTimers();
		});

		it("harus meneruskan inertiaOptions ke router.visit()", async () => {
			vi.useFakeTimers();

			const adapter = InertiaAdapter.getInstance();
			adapter.scheduleVisit("http://localhost/?q=test", {
				only: ["users"],
				preserveState: true,
			});

			vi.advanceTimersByTime(0);
			await Promise.resolve();

			const callArgs = vi.mocked(router.visit).mock.calls[0][1] as Record<
				string,
				unknown
			>;
			expect(callArgs.only).toEqual(["users"]);

			vi.useRealTimers();
		});

		it("harus menggabungkan beberapa scheduleVisit() menjadi satu router.visit()", async () => {
			vi.useFakeTimers();

			const adapter = InertiaAdapter.getInstance();
			adapter.scheduleVisit("http://localhost/?q=a");
			adapter.scheduleVisit("http://localhost/?q=b");
			adapter.scheduleVisit("http://localhost/?q=c");

			vi.advanceTimersByTime(0);
			await Promise.resolve();

			// Hanya satu visit yang boleh terjadi (yang terakhir)
			expect(router.visit).toHaveBeenCalledTimes(1);
			expect(vi.mocked(router.visit).mock.calls[0][0]).toBe(
				"http://localhost/?q=c",
			);

			vi.useRealTimers();
		});
	});

	// onSuccess

	describe("onSuccess()", () => {
		it("harus memanggil callback yang terdaftar saat inertia:success", () => {
			const adapter = InertiaAdapter.getInstance();
			const callback = vi.fn();
			adapter.onSuccess(callback);

			// Simulate Inertia success event
			document.dispatchEvent(new Event("inertia:success"));

			expect(callback).toHaveBeenCalledTimes(1);
		});

		it("harus mendukung multiple callbacks", () => {
			const adapter = InertiaAdapter.getInstance();
			const callbackA = vi.fn();
			const callbackB = vi.fn();

			adapter.onSuccess(callbackA);
			adapter.onSuccess(callbackB);

			document.dispatchEvent(new Event("inertia:success"));

			expect(callbackA).toHaveBeenCalled();
			expect(callbackB).toHaveBeenCalled();
		});

		it("harus mengembalikan fungsi unregister yang berfungsi", () => {
			const adapter = InertiaAdapter.getInstance();
			const callback = vi.fn();

			const unregister = adapter.onSuccess(callback);
			unregister(); // Remove listener

			document.dispatchEvent(new Event("inertia:success"));

			expect(callback).not.toHaveBeenCalled();
		});
	});

	// detach/reset

	describe("reset()", () => {
		it("harus men-detach listener setelah reset", () => {
			const adapter = InertiaAdapter.getInstance();
			const callback = vi.fn();
			adapter.onSuccess(callback);

			InertiaAdapter.reset();

			// Event setelah reset tidak boleh sampai ke callback lama
			document.dispatchEvent(new Event("inertia:success"));
			expect(callback).not.toHaveBeenCalled();
		});

		it("harus membuat instance baru setelah reset", () => {
			const before = InertiaAdapter.getInstance();
			InertiaAdapter.reset();
			const after = InertiaAdapter.getInstance();

			expect(before).not.toBe(after);
		});
	});
});
