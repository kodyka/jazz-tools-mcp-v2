# Task 00 — PR #4 merge hardening

Priority: P0
Status: P0 complete; P1 cleanup remains

## Goal

Make PR #4 mergeable with a passing end-to-end Inspector gate and track the remaining correctness/maintenance cleanup discovered in review.

## Subtasks

### T00.1 Fix embedded Vite/WASM E2E
- [x] Identify failing browser job and exact Vite WASM error.
- [x] Preserve Jazz `buildJazzViteConfig()`.
- [x] Add `vite-plugin-wasm` to the dev graph.
- [x] Add fresh WASM plugin instances via `worker.plugins`.
- [x] Use `build.target = "esnext"` instead of the incompatible top-level-await SWC rewrite.
- [x] Avoid worker-module misclassification by using an extensionless explicit test WASM URL.
- [x] Assert the actual overlay host contract.
- [x] Enable fixture dev telemetry before the first host query subscribes.
- [x] Confirm final CI standalone/embedded builds pass.
- [x] Confirm final CI embedded overlay passes.

### T00.2 Encode every runtime table route — P1 follow-up
- [x] Sidebar data/schema routes encoded.
- [x] Relation-navigation route encoded.
- [x] Stale-table redirect encoded.
- [ ] Grid toolbar Schema link encoded.
- [ ] Live Query `buildExplorerUrl()` table segment encoded.
- [ ] Add special-character route regression coverage.

### T00.3 Isolate `useAll()` compatibility — P1 follow-up
- [ ] Add `normalizeUseAllResult()` utility.
- [ ] Cover legacy array, legacy undefined, and current structured shapes.
- [ ] Use helper in main grid query.
- [ ] Use helper in relation query.
- [ ] Document removal condition when the pinned Jazz alpha no longer needs compatibility.

### T00.4 Final P0 merge gate
- [x] root `npm run check && npm test && npm run build`.
- [x] Inspector `pnpm test` — 84/84.
- [x] Inspector `pnpm build` — standalone + embedded.
- [x] `pnpm build:vercel` and output verification.
- [x] `pnpm test:browser` — 13/13.

Verified by CI run #73 on commit `96ba2c4aa291997a64a5b9dd512e3bd99681d967`.

## Acceptance

The P0 merge blocker is resolved and the full required CI gate is green. The two P1 items above remain explicit follow-up work; they are not prerequisites for claiming the embedded runtime/CI fix is complete.
