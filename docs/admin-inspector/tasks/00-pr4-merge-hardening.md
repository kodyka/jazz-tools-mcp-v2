# Task 00 — PR #4 merge hardening

Priority: P0

## Goal

Make PR #4 mergeable with a passing end-to-end Inspector gate and remove known correctness gaps discovered in review.

## Subtasks

### T00.1 Fix embedded Vite/WASM E2E
- [x] Identify failing browser job and exact Vite WASM error.
- [x] Preserve Jazz `buildJazzViteConfig()`.
- [x] Add `vite-plugin-wasm` to dev graph.
- [x] Add fresh WASM plugin instances via `worker.plugins`.
- [x] Use `build.target = "esnext"` instead of the incompatible top-level-await SWC rewrite.
- [ ] Confirm final CI standalone/embedded builds pass.
- [ ] Confirm final CI embedded overlay passes.

### T00.2 Encode every runtime table route
- [x] Sidebar data/schema routes encoded.
- [x] Relation-navigation route encoded.
- [x] Stale-table redirect encoded.
- [ ] Grid toolbar Schema link encoded.
- [ ] Add special-character table regression test.

### T00.3 Isolate `useAll()` compatibility
- [ ] Add `normalizeUseAllResult()` utility.
- [ ] Cover legacy array, legacy undefined, and current structured shapes.
- [ ] Use helper in main grid query.
- [ ] Use helper in relation query.
- [ ] Document removal condition when pinned Jazz alpha no longer needs compatibility.

### T00.4 Final gate
- [ ] root `npm run check && npm test && npm run build`.
- [ ] Inspector `pnpm test`.
- [ ] Inspector `pnpm build`.
- [ ] `pnpm build:vercel`.
- [ ] `pnpm test:browser` all green.

## Acceptance

No known P0 CI failure remains and P1 route/API compatibility gaps have regression coverage before merge.
