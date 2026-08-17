# Full snippet — Vite WASM runtime/E2E configuration

The published Jazz worker graph needs a WASM ESM transform in the extracted Inspector. `vite-plugin-wasm` emits top-level await, so this configuration targets `esnext` rather than running the incompatible `vite-plugin-top-level-await` SWC rewrite.

```ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import { buildJazzViteConfig } from "jazz-tools/dev/vite";
import { defineConfig, type Plugin, type UserConfig } from "vite";
import wasm from "vite-plugin-wasm";

const jazzRuntimeConfig = buildJazzViteConfig({});
const require = createRequire(import.meta.url);
const jazzToolsPackageRoot = dirname(require.resolve("jazz-tools/package.json"));
const jazzToolsRequire = createRequire(resolve(jazzToolsPackageRoot, "package.json"));
const jazzWasmEntry = jazzToolsRequire.resolve("jazz-wasm");
const jazzViteAliases = jazzRuntimeConfig.resolve?.alias ?? [];

const testWorkerAliases = [
  {
    find: /^@jazz-test-worker-entry$/,
    replacement: resolve(jazzToolsPackageRoot, "dist", "worker", "jazz-worker.js"),
  },
  {
    find: /^@jazz-test-broker-worker-entry$/,
    replacement: resolve(jazzToolsPackageRoot, "dist", "worker", "jazz-broker-worker.js"),
  },
];

const testRuntimeFiles = new Map<string, { path: string; contentType: string }>([
  [
    "/__jazz/test-runtime.wasm",
    {
      path: resolve(dirname(jazzWasmEntry), "jazz_wasm_bg.wasm"),
      contentType: "application/wasm",
    },
  ],
]);

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

function createWasmPlugins() {
  return [wasm()];
}

const sharedConfig = {
  ...jazzRuntimeConfig,
  resolve: {
    ...(jazzRuntimeConfig.resolve ?? {}),
    alias: [...jazzViteAliases, ...testWorkerAliases],
  },
  worker: {
    ...(jazzRuntimeConfig.worker ?? {}),
    plugins: () => createWasmPlugins(),
  },
};

export default defineConfig(({ mode }): UserConfig => {
  const plugins = [inspectorBrowserTestRuntimePlugin(), ...createWasmPlugins(), react()];

  if (mode === "embedded") {
    return {
      ...sharedConfig,
      plugins,
      base: "./",
      build: {
        target: "esnext",
        outDir: "dist-embedded",
        emptyOutDir: true,
        rollupOptions: { input: { index: resolve(__dirname, "embedded.html") } },
      },
    };
  }

  return {
    ...sharedConfig,
    plugins,
    base: "/",
    publicDir: "public",
    build: {
      target: "esnext",
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
```

`worker.plugins` returns fresh instances because Vite can build worker bundles in parallel. Keeping `buildJazzViteConfig()` is still required for the Jazz-specific alias and dependency-optimizer behavior.
