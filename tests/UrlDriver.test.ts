import { beforeEach, describe, expect, it, vi } from "vitest";
import { UrlDriver } from "../src/drivers/UrlDriver";

// UrlDriver is now pure — it no longer calls router.visit().
// We verify that history.replaceState() is called instead.

const replaceStateSpy = vi.spyOn(window.history, "replaceState");

describe("UrlDriver", () => {
	beforeEach(() => {
		// Reset URL to clean state before each test
		window.history.replaceState({}, "", "/");
		replaceStateSpy.mockClear();
	});

	describe("read()", () => {
		it("harus mengembalikan null jika key tidak ada di URL", () => {
			const driver = new UrlDriver();
			expect(driver.read("q")).toBeNull();
		});

		it("harus membaca nilai string dari URLSearchParams", () => {
			window.history.replaceState({}, "", "/?q=hello");
			const driver = new UrlDriver();
			// "hello" bukan JSON valid, safeJsonDeserialize fallback ke raw string
			expect(driver.read("q")).toBe("hello");
		});

		it("harus men-deserialize nilai JSON (object) dari URL", () => {
			const data = { email: true, phone: false };
			window.history.replaceState(
				{},
				"",
				`/?cols=${encodeURIComponent(JSON.stringify(data))}`,
			);
			const driver = new UrlDriver<typeof data>();
			expect(driver.read("cols")).toEqual(data);
		});

		it("harus menggunakan custom deserializer jika disediakan", () => {
			window.history.replaceState({}, "", "/?page=5");
			const driver = new UrlDriver<number>((raw) => Number(raw));
			expect(driver.read("page")).toBe(5);
		});
	});

	describe("write()", () => {
		it("harus memanggil history.replaceState() — bukan router.visit()", () => {
			const driver = new UrlDriver<string>();
			driver.write("q", "test-query", { driver: "url", defaultValue: "" });

			expect(replaceStateSpy).toHaveBeenCalledTimes(1);
		});

		it("harus menulis key ke URL via history.replaceState()", () => {
			const driver = new UrlDriver<string>();
			driver.write("q", "test-query", { driver: "url", defaultValue: "" });

			const newUrl = window.location.search;
			expect(newUrl).toContain("q=");
			expect(decodeURIComponent(newUrl)).toContain('"test-query"');
		});

		it("harus men-serialize object ke JSON di URL", () => {
			const driver = new UrlDriver<{ page: number }>();
			driver.write(
				"filter",
				{ page: 2 },
				{ driver: "url", defaultValue: { page: 1 } },
			);

			expect(decodeURIComponent(window.location.search)).toContain(
				'{"page":2}',
			);
		});

		it("harus menggunakan custom serialize jika disediakan", () => {
			const driver = new UrlDriver<number>();
			driver.write("page", 3, {
				driver: "url",
				defaultValue: 1,
				serialize: (v) => String(v),
			});

			expect(window.location.search).toContain("page=3");
		});

		it("harus menghapus key dari URL jika value adalah string kosong", () => {
			window.history.replaceState({}, "", "/?q=%22hello%22");
			const driver = new UrlDriver<string>();
			driver.write("q", "", { driver: "url", defaultValue: "" });

			expect(window.location.search).not.toContain("q=");
		});

		it("TIDAK boleh memanggil router.visit() secara langsung", () => {
			// router.visit is now InertiaAdapter's responsibility
			// UrlDriver must never import or call it directly
			const driver = new UrlDriver<string>();

			// If UrlDriver internally called router.visit, this would throw
			// because @inertiajs/core is not mocked in this test file.
			expect(() =>
				driver.write("q", "test", { driver: "url", defaultValue: "" }),
			).not.toThrow();
		});
	});

	describe("remove()", () => {
		it("harus menghapus key dari URL via history.replaceState()", () => {
			window.history.replaceState({}, "", '/?q="hello"&page=1');
			const driver = new UrlDriver();
			driver.remove("q");

			expect(replaceStateSpy).toHaveBeenCalledTimes(2); // 1x setup + 1x remove
			expect(window.location.search).not.toContain("q=");
			expect(window.location.search).toContain("page=");
		});

		it("harus menghasilkan URL bersih tanpa query string jika semua key dihapus", () => {
			window.history.replaceState({}, "", "/?q=test");
			const driver = new UrlDriver();
			driver.remove("q");

			expect(window.location.href).toBe("http://localhost:3000/");
		});
	});
});
