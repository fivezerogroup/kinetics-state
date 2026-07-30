import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDebounce } from "../src/utils/debounce";

describe("createDebounce", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	it("harus menunda pemanggilan fungsi sesuai wait time", () => {
		const fn = vi.fn();
		const { debounced } = createDebounce(fn, 300);

		debounced();
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(300);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("harus mereset timer jika dipanggil berulang (debounce behavior)", () => {
		const fn = vi.fn();
		const { debounced } = createDebounce(fn, 300);

		debounced();
		vi.advanceTimersByTime(200); // belum sampai 300ms
		debounced(); // reset timer
		vi.advanceTimersByTime(200); // total 400ms, tapi timer baru baru 200ms
		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(100); // sekarang 300ms sejak debounce terakhir
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("harus meneruskan argumen ke fungsi asli", () => {
		const fn = vi.fn();
		const { debounced } = createDebounce(fn, 100);

		debounced("hello", 42);
		vi.advanceTimersByTime(100);

		expect(fn).toHaveBeenCalledWith("hello", 42);
	});

	it("cancel() harus membatalkan timer yang berjalan", () => {
		const fn = vi.fn();
		const { debounced, cancel } = createDebounce(fn, 300);

		debounced();
		cancel();
		vi.advanceTimersByTime(300);

		expect(fn).not.toHaveBeenCalled();
	});

	it("cancel() aman dipanggil jika tidak ada timer yang berjalan", () => {
		const fn = vi.fn();
		const { cancel } = createDebounce(fn, 300);

		// Tidak boleh throw error
		expect(() => cancel()).not.toThrow();
	});
});
