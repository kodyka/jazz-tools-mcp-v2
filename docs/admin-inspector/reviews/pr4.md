# PR #4 review — merge hardening

PR: `#4 feat: add Jazz Admin Inspector plan and WhoDB-inspired shell`

## Verdict

The core architecture is correct: retain runtime schema discovery, generic Jazz queries, reactive reads, and Jazz mutations. WhoDB should influence navigation density, CRUD discoverability, destructive-action UX, schema access, and test organization—not the backend data layer.

The P0 embedded runtime/CI blocker is resolved. CI run #73 is fully green. Two P1 cleanup items remain explicitly open: complete runtime-route encoding and centralize the published-alpha/current `useAll()` compatibility bridge.

## CI evidence reviewed

### Baseline
- root MCP passed;
- Inspector unit tests: 84 passed;
- TypeScript/build passed;
- Vercel build passed;
- Playwright: 12 passed, 1 failed because Vite did not transform WebAssembly ESM in the embedded worker graph.

### Run #68 — top-level-await plugin incompatibility
- Inspector unit tests: 84 passed;
- `pnpm build` failed inside `vite-plugin-top-level-await` SWC printing with `missing field type`.

Resolution: keep `vite-plugin-wasm`, remove the active TLA rewrite, and target `esnext` so the generated top-level await remains native.

### Run #69 — worker URL falsely classified as WASM
- root MCP passed;
- Inspector unit tests: 84 passed;
- standalone and embedded builds passed;
- Vercel build passed;
- Playwright again reached 12/13;
- the original unsupported-WASM error was gone;
- `vite-plugin-wasm@3.6.0` misclassified the worker module URL because its `jazz-wasm-url` query value ended in `.wasm`.

Resolution: serve the real test binary from extensionless `/__jazz/test-runtime` with `Content-Type: application/wasm`.

### Run #70 — runtime fixed, stale broker assertion
- all pre-browser gates passed;
- the host reached `Host ready`;
- the prior WASM/worker errors were gone;
- only a stale expectation for `/__jazz/test-broker-worker.js` failed while the fixture correctly used `/tests/browser/jazz-test-broker-worker.ts`.

Resolution: assert the configured Vite module worker URL.

### Run #71 — non-contract `wasmUrl` assertion
- embedded connection progressed further;
- the test expected `getConnectionConfig().runtimeSources.wasmUrl` to be present.

Upstream Jazz's `buildOverlayDbConfig()` intentionally republishes the resolved persistent-store/broker coordinates and not the host's WASM URL. The test was asserting an implementation detail outside the public host contract.

Resolution: assert `brokerWorkerUrl`, then prove connection/schema behavior through the embedded UI.

### Run #72 — subscription trace timing
- root job passed completely;
- Inspector unit/build/Vercel gates passed;
- embedded Inspector connected and discovered `todos`;
- Subscriptions page remained empty.

Jazz records an active-query trace when the subscription starts only if `DbConfig.devMode` is already true. The test's `useAll(app.todos)` mounted before `installInspectorHost()` could set dev mode in an effect.

Resolution: initialize the browser test host with `devMode: true` before `JazzProvider` creates the query subscription.

### Run #73 — final green gate
Commit: `96ba2c4aa291997a64a5b9dd512e3bd99681d967`

- root `npm run check`: passed;
- root `npm test`: passed;
- root `npm run build`: passed;
- Inspector `pnpm test`: 84/84 passed;
- standalone + embedded build: passed;
- Vercel build + `dist/index.html` verification: passed;
- Chromium installation: passed;
- Playwright browser E2E: 13/13 passed.

## Bugs fixed in the P0 hardening chain

1. Missing WebAssembly ESM transform for the extracted published-package worker graph.
2. Incompatible top-level-await rewrite plugin in the Jazz worker build path.
3. `.wasm` query-value false positive in `vite-plugin-wasm` module matching.
4. Stale broker-worker URL assertion.
5. Test asserting a non-contract overlay `wasmUrl` field.
6. Browser fixture enabling DevTools telemetry after its first query subscription had already registered.

## Remaining P1 findings

### P1 — two runtime table route producers still interpolate raw table names

The sidebar, relation navigation, and stale-table redirect are encoded, but review found two remaining raw path producers:

```tsx
// TableDataGrid toolbar
to={`/data-explorer/${table}/schema`}
```

```ts
// Live Query
const base = `/data-explorer/${table}/data`;
```

Both should use one `tableViewPath()` helper based on `encodeURIComponent(tableName)` and receive special-character regression coverage. See ST-002 and `snippets/route-safety.md`.

### P1 — `useAll()` compatibility logic is duplicated

The extracted fork supports the published alpha's legacy array/undefined result shape while tolerating current Jazz's structured `{ data, isLoading, error }` state. Main-grid and relation-cell branching should move into one tested `normalizeUseAllResult()` utility. See ST-003 and `snippets/use-all-normalizer.md`.

## Upstream Jazz double-check

Current upstream Inspector uses structured `useAll()` state. Jazz's `buildJazzViteConfig()` handles worker format, `jazz-wasm` optimizer exclusion, SSR externalization, and alias resolution; the extracted published-package setup still needs its consumer-side WASM transform.

The upstream overlay host contract documents a ready-to-use config built from host identity plus resolved persistent-store/broker coordinates. The overlay receives and uses that config verbatim; it is not required to receive the host's explicit WASM URL.

## WhoDB double-check

WhoDB remains a UX/testing reference: database-object navigation, searchable/dense exploration, obvious CRUD actions, typed filters, schema access, and E2E organization. None of those require adopting WhoDB's GraphQL/SQL source architecture.

## Merge gate

The required P0 gate is now green in run #73. Browser E2E remains mandatory on future heads because unit tests cannot validate the published worker/WASM/embedded runtime path or two-writer realtime behavior.
