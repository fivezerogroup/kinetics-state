import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["cjs", "esm"], // Menghasilkan index.js dan index.mjs
	dts: true, // Otomatis membuat index.d.ts untuk TypeScript
	splitting: false,
	sourcemap: true,
	clean: true, // Selalu bersihkan folder /dist sebelum build
	minify: true,
	external: ["react", "@inertiajs/react", "@inertiajs/core"], // Jangan bundle library ini
});
