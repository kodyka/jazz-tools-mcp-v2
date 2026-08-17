# ST-001 — Fix Vite WASM browser E2E

Parent: Task 00
Priority: P0
Status: implementation iterating under CI

## Failure sequence and fixes

### Baseline

`pnpm test:browser` passed 12 tests and failed the embedded overlay because Vite rejected WebAssembly ESM integration while transforming the published Jazz worker graph.

### Iteration 1

Adding `vite-plugin-wasm` plus `vite-plugin-top-level-await` moved the failure earlier to `pnpm build`: the top-level-await plugin crashed in its SWC print path with `missing field type`.

### Iteration 2

Keeping `vite-plugin-wasm`, setting `build.target = "esnext"`, and removing the active top-level-await rewrite fixed unit/build/Vercel gates. Browser E2E then exposed a second issue: Jazz puts `runtimeSources.wasmUrl` in the worker module query string, and `vite-plugin-wasm@3.6.0` uses a simple `id.endsWith(".wasm")` check. A worker URL such as:

```text
/tests/browser/jazz-test-worker.ts?jazz-wasm-url=.../__jazz/test-runtime.wasm
```

was therefore misclassified as a local WASM file and failed with ENOENT.

### Iteration 3

Serve the same test binary from an extensionless URL:

```text
/__jazz/test-runtime
```

with `Content-Type: application/wasm`. Jazz receives the same explicit binary URL, while the worker module ID can no longer satisfy the plugin's `.endsWith(".wasm")` matcher.

## Checklist

- [x] preserve Jazz `buildJazzViteConfig()` aliases/optimizer settings;
- [x] apply `vite-plugin-wasm` to the normal Vite graph;
- [x] apply fresh `vite-plugin-wasm` instances via `worker.plugins`;
- [x] set standalone and embedded build target to `esnext`;
- [x] remove `vite-plugin-top-level-await` from the active plugin graph;
- [x] make the test runtime WASM URL extensionless while preserving WASM content type;
- [x] assert the published host handle exposes the expected extensionless `wasmUrl`;
- [ ] confirm final CI embedded overlay passes;
- [ ] confirm full Inspector CI passes.

## Acceptance

The standalone/embedded builds and all 13 browser tests pass without disabling the embedded test, bypassing Jazz workers, or introducing a second data/runtime architecture.
