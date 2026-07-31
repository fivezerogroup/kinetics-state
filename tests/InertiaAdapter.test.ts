import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InertiaAdapter } from "../src/adapters/InertiaAdapter";

// Mock router — disimulasikan seperti yang diinjeksi oleh framework binding
// (misal: `router` dari `@inertiajs/react` atau `@inertiajs/vue3`)
const mockRouter = {
	visit: vi.fn(),
};

describe("InertiaAdapter", () => {
	beforeEach(() => {
		// Reset singleton dan router ref antara test
		InertiaAdapter.reset();
		mockRouter.visit.mockClear();
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

	// setRouter

	describe("setRouter()", () => {
		it("harus menyimpan router yang diinjeksi", async () => {
			vi.useFakeTimers();

			InertiaAdapter.setRouter(mockRouter);
			const adapter = InertiaAdapter.getInstance();
			adapter.scheduleVisit("http://localhost/?q=test");

			vi.advanceTimersByTime(0);
			await Promise.resolve();

			expect(mockRouter.visit).toHaveBeenCalledTimes(1);

			vi.useRealTimers();
		});

		it("harus menimpa router lama jika dipanggil ulang", async () => {
			vi.useFakeTimers();

			const firstRouter = { visit: vi.fn() };
			const secondRouter = { visit: vi.fn() };

			InertiaAdapter.setRouter(firstRouter);
			InertiaAdapter.setRouter(secondRouter);

			const adapter = InertiaAdapter.getInstance();
			adapter.scheduleVisit("http://localhost/?q=test");

			vi.advanceTimersByTime(0);
			await Promise.resolve();

			expect(firstRouter.visit).not.toHaveBeenCalled();
			expect(secondRouter.visit).toHaveBeenCalledTimes(1);

			vi.useRealTimers();
		});
	});

	// scheduleVisit

	describe("scheduleVisit()", () => {
		it("harus memanggil router.visit() setelah 0ms timer", async () => {
			vi.useFakeTimers();

			InertiaAdapter.setRouter(mockRouter);
			const adapter = InertiaAdapter.getInstance();
			adapter.scheduleVisit("http://localhost/?q=test");

			// Belum dipanggil sebelum timer fire
			expect(mockRouter.visit).not.toHaveBeenCalled();

			vi.advanceTimersByTime(0);
			await Promise.resolve(); // flush microtasks

			expect(mockRouter.visit).toHaveBeenCalledWith(
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

			InertiaAdapter.setRouter(mockRouter);
			const adapter = InertiaAdapter.getInstance();
			adapter.scheduleVisit("http://localhost/?q=test", {
				only: ["users"],
				preserveState: true,
			});

			vi.advanceTimersByTime(0);
			await Promise.resolve();

			const callArgs = mockRouter.visit.mock.calls[0][1] as Record<
				string,
				unknown
			>;
			expect(callArgs.only).toEqual(["users"]);

			vi.useRealTimers();
		});

		it("harus menggabungkan beberapa scheduleVisit() menjadi satu router.visit()", async () => {
			vi.useFakeTimers();

			InertiaAdapter.setRouter(mockRouter);
			const adapter = InertiaAdapter.getInstance();
			adapter.scheduleVisit("http://localhost/?q=a");
			adapter.scheduleVisit("http://localhost/?q=b");
			adapter.scheduleVisit("http://localhost/?q=c");

			vi.advanceTimersByTime(0);
			await Promise.resolve();

			// Hanya satu visit yang boleh terjadi (yang terakhir)
			expect(mockRouter.visit).toHaveBeenCalledTimes(1);
			expect(mockRouter.visit.mock.calls[0][0]).toBe("http://localhost/?q=c");

			vi.useRealTimers();
		});

		it("harus mengeluarkan warning dan tidak memanggil visit jika router belum di-set", async () => {
			vi.useFakeTimers();
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			// Tidak memanggil setRouter()
			const adapter = InertiaAdapter.getInstance();
			adapter.scheduleVisit("http://localhost/?q=test");

			vi.advanceTimersByTime(0);
			await Promise.resolve();

			expect(mockRouter.visit).not.toHaveBeenCalled();
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"[kinetics-state] InertiaAdapter.setRouter() was not called",
				),
			);

			warnSpy.mockRestore();
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

		it("harus membersihkan routerRef setelah reset", async () => {
			vi.useFakeTimers();
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			InertiaAdapter.setRouter(mockRouter);
			InertiaAdapter.reset(); // routerRef harus dikosongkan

			const adapter = InertiaAdapter.getInstance();
			adapter.scheduleVisit("http://localhost/?q=test");

			vi.advanceTimersByTime(0);
			await Promise.resolve();

			// Router sudah di-clear, visit tidak boleh dipanggil
			expect(mockRouter.visit).not.toHaveBeenCalled();
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"[kinetics-state] InertiaAdapter.setRouter() was not called",
				),
			);

			warnSpy.mockRestore();
			vi.useRealTimers();
		});
	});
});
