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
const jazzToolsRequire = createRequire(resolve(jazzToolsPackageRoot, "package.json"));
const jazzWasmEntry = jazzToolsRequire.resolve("jazz-wasm");

const testRuntimeFiles = new Map<string, { path: string; contentType: string }>([
  [
    "/__jazz/test-worker.js",
    {
      path: resolve(jazzToolsPackageRoot, "dist", "worker", "jazz-worker.js"),
      contentType: "text/javascript; charset=utf-8",
    },
  ],
  [
    "/__jazz/test-broker-worker.js",
    {
      path: resolve(jazzToolsPackageRoot, "dist", "worker", "jazz-broker-worker.js"),
      contentType: "text/javascript; charset=utf-8",
    },
  ],
  [
    "/__jazz/test-runtime.wasm",
    {
      path: resolve(dirname(jazzWasmEntry), "jazz_wasm_bg.wasm"),
      contentType: "application/wasm",
    },
  ],
]);

/**
 * Browser E2E uses a real host bundle plus the separately-built embedded
 * Inspector. Worker identity and WASM bootstrap URLs must therefore be stable
 * across both bundles.
 *
 * Playwright page routing does not reliably serve Worker/SharedWorker scripts.
 * Serve the exact runtime files from the pinned package through Vite itself so
 * the browser can fetch them as normal same-origin resources.
 */
function inspectorBrowserTestRuntimePlugin(): Plugin {
  return {
    name: "inspector-browser-test-runtime",
    apply: "serve",
    configureServer(server) {
      for (const [urlPath, file] of testRuntimeFiles) {
        server.middlewares.use(urlPath, (_request, response, next) => {
          try {
            response.statusCode = 200;
            response.setHeader("Content-Type", file.contentType);
            response.setHeader("Cache-Control", "no-store");
            response.end(readFileSync(file.path));
          } catch (error) {
            next(error as Error);
          }
        });
      }
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
