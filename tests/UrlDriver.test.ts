import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UrlDriver } from '../src/drivers/UrlDriver';

// Mock @inertiajs/core agar tidak perlu Inertia app yang aktif
vi.mock('@inertiajs/core', () => ({
  router: {
    visit: vi.fn(),
  },
}));

import { router } from '@inertiajs/core';

describe('UrlDriver', () => {
  beforeEach(() => {
    // Reset URL ke kondisi bersih sebelum setiap test
    window.history.replaceState({}, '', '/');
    vi.mocked(router.visit).mockClear();
  });

  describe('read()', () => {
    it('harus mengembalikan null jika key tidak ada di URL', () => {
      const driver = new UrlDriver();
      expect(driver.read('q')).toBeNull();
    });

    it('harus membaca nilai string dari URLSearchParams', () => {
      window.history.replaceState({}, '', '/?q=hello');
      const driver = new UrlDriver();
      // "hello" bukan JSON valid, safeJsonDeserialize fallback ke raw string
      expect(driver.read('q')).toBe('hello');
    });

    it('harus men-deserialize nilai JSON (object) dari URL', () => {
      const data = { email: true, phone: false };
      window.history.replaceState({}, '', `/?cols=${encodeURIComponent(JSON.stringify(data))}`);
      const driver = new UrlDriver<typeof data>();
      expect(driver.read('cols')).toEqual(data);
    });

    it('harus menggunakan custom deserializer jika disediakan', () => {
      window.history.replaceState({}, '', '/?page=5');
      const driver = new UrlDriver<number>((raw) => Number(raw));
      expect(driver.read('page')).toBe(5);
    });
  });

  describe('write()', () => {
    it('harus memanggil router.visit() dengan URL yang berisi key baru', () => {
      const driver = new UrlDriver<string>();
      driver.write('q', 'test-query', { driver: 'url', defaultValue: '' });

      expect(router.visit).toHaveBeenCalledTimes(1);
      const calledUrl = vi.mocked(router.visit).mock.calls[0][0] as string;
      expect(calledUrl).toContain('q=');
      expect(decodeURIComponent(calledUrl)).toContain('"test-query"');
    });

    it('harus men-serialize object ke JSON di URL', () => {
      const driver = new UrlDriver<{ page: number }>();
      driver.write('filter', { page: 2 }, { driver: 'url', defaultValue: { page: 1 } });

      const calledUrl = vi.mocked(router.visit).mock.calls[0][0] as string;
      expect(decodeURIComponent(calledUrl)).toContain('{"page":2}');
    });

    it('harus menggunakan custom serialize jika disediakan', () => {
      const driver = new UrlDriver<number>();
      driver.write('page', 3, {
        driver: 'url',
        defaultValue: 1,
        serialize: (v) => String(v),
      });

      const calledUrl = vi.mocked(router.visit).mock.calls[0][0] as string;
      expect(calledUrl).toContain('page=3');
    });

    it('harus menghapus key dari URL jika value adalah string kosong', () => {
      window.history.replaceState({}, '', '/?q=%22hello%22');
      const driver = new UrlDriver<string>();
      driver.write('q', '', { driver: 'url', defaultValue: '' });

      const calledUrl = vi.mocked(router.visit).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('q=');
    });

    it('harus meneruskan inertiaOptions ke router.visit()', () => {
      const driver = new UrlDriver<string>();
      driver.write('q', 'test', {
        driver: 'url',
        defaultValue: '',
        inertiaOptions: { preserveState: true, only: ['users'] },
      });

      const callArgs = vi.mocked(router.visit).mock.calls[0][1] as Record<string, unknown>;
      expect(callArgs.only).toEqual(['users']);
    });
  });

  describe('remove()', () => {
    it('harus menghapus key dari URL dan memanggil router.visit()', () => {
      window.history.replaceState({}, '', '/?q=%22hello%22&page=1');
      const driver = new UrlDriver();
      driver.remove('q');

      expect(router.visit).toHaveBeenCalledTimes(1);
      const calledUrl = vi.mocked(router.visit).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('q=');
      expect(calledUrl).toContain('page=');
    });
  });
});
