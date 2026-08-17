# ST-001 — Fix Vite WASM browser E2E

Parent: Task 00
Priority: P0
Status: implementation iterating under CI

## Problem

The original `pnpm test:browser` run passed 12 tests and failed the embedded overlay test because the Vite dev server rejected WebAssembly ESM integration while transforming the published Jazz worker graph.

## First fix and CI feedback

Adding both `vite-plugin-wasm` and `vite-plugin-top-level-await` removed the missing-WASM-transform design gap, but CI then failed earlier during `pnpm build`: `vite-plugin-top-level-await` crashed in its SWC print step with `missing field type` while bundling the Jazz worker.

## Revised implementation

`vite-plugin-wasm` itself emits top-level `await`. Its documented alternative to the TLA rewrite plugin is to target modern ESM (`build.target = "esnext"`). The Inspector already targets a modern development/admin browser runtime.

- [x] preserve Jazz `buildJazzViteConfig()` aliases/optimizer settings;
- [x] apply `vite-plugin-wasm` to the normal Vite graph;
- [x] apply fresh `vite-plugin-wasm` instances via `worker.plugins`;
- [x] set standalone and embedded build target to `esnext`;
- [x] remove `vite-plugin-top-level-await` from the active plugin graph;
- [ ] confirm standalone build passes;
- [ ] confirm embedded build passes;
- [ ] confirm embedded overlay Playwright test passes;
- [ ] confirm full Inspector CI passes.

## Acceptance

The build and embedded overlay both load Jazz WASM without disabling tests, bypassing Jazz workers, or introducing a second runtime path.
