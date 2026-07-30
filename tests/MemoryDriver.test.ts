import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryDriver } from '../src/drivers/MemoryDriver';

describe('MemoryDriver', () => {
  let driver: MemoryDriver<unknown>;

  beforeEach(() => {
    // Buat instance baru dengan prefix unik per test untuk isolasi
    driver = new MemoryDriver(`test-${Math.random()}`);
  });

  it('read() harus mengembalikan null jika key belum ada', () => {
    expect(driver.read('key-not-exist')).toBeNull();
  });

  it('write() + read() harus menyimpan dan mengambil nilai dengan benar', () => {
    const opts = { driver: 'memory' as const, defaultValue: '' };
    driver.write('name', 'Alice', opts);
    expect(driver.read('name')).toBe('Alice');
  });

  it('harus mendukung tipe data object', () => {
    const opts = { driver: 'memory' as const, defaultValue: {} };
    const data = { email: true, phone: false };
    driver.write('columns', data, opts);
    expect(driver.read('columns')).toEqual(data);
  });

  it('harus mendukung tipe data array', () => {
    const opts = { driver: 'memory' as const, defaultValue: [] };
    const data = [1, 2, 3];
    driver.write('items', data, opts);
    expect(driver.read('items')).toEqual(data);
  });

  it('remove() harus menghapus nilai sehingga read() kembali null', () => {
    const opts = { driver: 'memory' as const, defaultValue: '' };
    driver.write('name', 'Alice', opts);
    driver.remove('name');
    expect(driver.read('name')).toBeNull();
  });

  it('remove() aman dipanggil pada key yang tidak ada', () => {
    expect(() => driver.remove('non-existent')).not.toThrow();
  });

  it('dua driver dengan prefix berbeda tidak boleh saling mempengaruhi', () => {
    const driverA = new MemoryDriver('app-a');
    const driverB = new MemoryDriver('app-b');
    const opts = { driver: 'memory' as const, defaultValue: '' };

    driverA.write('theme', 'dark', opts);
    driverB.write('theme', 'light', opts);

    expect(driverA.read('theme')).toBe('dark');
    expect(driverB.read('theme')).toBe('light');
  });

  it('write() harus menimpa nilai yang sudah ada', () => {
    const opts = { driver: 'memory' as const, defaultValue: 0 };
    driver.write('count', 1, opts);
    driver.write('count', 99, opts);
    expect(driver.read('count')).toBe(99);
  });
});
