import { resolve } from "node:path";
import { buildJazzViteConfig } from "jazz-tools/dev/vite";
import { defineConfig, type UserConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

/**
 * The extracted Inspector consumes the published `jazz-tools` package instead
 * of the Jazz monorepo workspace source. In that layout `jazz-tools` dynamically
 * imports `jazz-wasm`, so we must apply Jazz's supported Vite config hook:
 *
 * - exclude `jazz-wasm` from Vite/esbuild dependency pre-bundling;
 * - resolve the nested pnpm `jazz-wasm` dependency to an absolute entry;
 * - keep workers in ES-module format.
 *
 * Without this config the browser resolves the WASM URL to the SPA root and
 * receives index.html, which fails with "expected magic word 00 61 73 6d".
 */
const jazzRuntimeConfig = buildJazzViteConfig({});

export default defineConfig(({ mode }): UserConfig => {
  if (mode === "embedded") {
    return {
      ...jazzRuntimeConfig,
      plugins: [react()],
      base: "./",
      build: {
        outDir: "dist-embedded",
        emptyOutDir: true,
        rollupOptions: { input: { index: resolve(__dirname, "embedded.html") } },
      },
    };
  }

  // The standalone "web" build (the default).
  return {
    ...jazzRuntimeConfig,
    plugins: [react()],
    base: "/",
    publicDir: "public",
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
