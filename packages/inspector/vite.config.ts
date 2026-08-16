import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import { buildJazzViteConfig } from "jazz-tools/dev/vite";
import { defineConfig, type Plugin, type UserConfig } from "vite";

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

const require = createRequire(import.meta.url);
const jazzToolsPackageRoot = dirname(require.resolve("jazz-tools/package.json"));
const testBrokerWorkerPath = resolve(
  jazzToolsPackageRoot,
  "dist",
  "worker",
  "jazz-broker-worker.js",
);

/**
 * Browser E2E uses a real host bundle plus the separately-built embedded
 * Inspector. A SharedWorker is identified by its exact script URL and name, so
 * both bundles need one stable URL that the browser itself can fetch.
 *
 * Playwright page routing is not a reliable way to serve SharedWorker scripts.
 * Serving the pinned jazz-tools broker worker from the Vite dev server keeps
 * the test on the same origin and makes host/iframe broker identity deterministic.
 */
function inspectorBrowserTestRuntimePlugin(): Plugin {
  return {
    name: "inspector-browser-test-runtime",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__jazz/test-broker-worker.js", (_request, response, next) => {
        try {
          response.statusCode = 200;
          response.setHeader("Content-Type", "text/javascript; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(readFileSync(testBrokerWorkerPath));
        } catch (error) {
          next(error as Error);
        }
      });
    },
  };
}

export default defineConfig(({ mode }): UserConfig => {
  if (mode === "embedded") {
    return {
      ...jazzRuntimeConfig,
      plugins: [inspectorBrowserTestRuntimePlugin(), react()],
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
    plugins: [inspectorBrowserTestRuntimePlugin(), react()],
    base: "/",
    publicDir: "public",
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
