# PR #4 review — merge hardening

PR: `#4 feat: add Jazz Admin Inspector plan and WhoDB-inspired shell`

## Verdict

The core architecture is correct: retain runtime schema discovery, generic Jazz queries, reactive reads, and Jazz mutations. WhoDB should influence navigation density, CRUD discoverability, destructive-action UX, and test organization—not the backend data layer.

## CI evidence reviewed

### Baseline
- root MCP passed;
- Inspector unit tests: 84 passed;
- TypeScript/build passed;
- Vercel build passed;
- Playwright: 12 passed, 1 failed because Vite did not transform WebAssembly ESM in the embedded worker graph.

### Hardening run #68
- Inspector unit tests: 84 passed;
- `pnpm build` failed inside `vite-plugin-top-level-await` SWC printing (`missing field type`).

### Hardening run #69
- root MCP job passed completely;
- Inspector unit tests: 84 passed;
- standalone and embedded builds passed;
- Vercel build passed;
- Playwright again reached 12 passed / 1 failed;
- the original unsupported-WASM error was gone;
- the remaining failure was `vite-plugin-wasm@3.6.0` misclassifying the worker module URL as a WASM file because the `jazz-wasm-url` query value ended in `.wasm`.

The next fix makes the test-only runtime URL extensionless while continuing to serve the real binary with `application/wasm`.

## Bugs found

### P0 — embedded overlay Jazz WASM path

Keep Jazz's `buildJazzViteConfig()`, use `vite-plugin-wasm`, target `esnext`, and ensure the explicit test `wasmUrl` cannot make a non-WASM worker module ID end in `.wasm`.

### P1 — grid toolbar schema route still has a raw runtime table segment

Patch:

```tsx
to={`/data-explorer/${encodeURIComponent(table)}/schema`}
```

Add regression coverage with `todos/archived #1`. See ST-002 and `snippets/route-safety.md`.

### P1 — `useAll()` compatibility logic is duplicated

Move legacy/current result normalization into `normalizeUseAllResult()` and test both shapes. See ST-003 and `snippets/use-all-normalizer.md`.

## Upstream Jazz double-check

Current upstream Inspector uses structured `useAll()` state. Jazz's `buildJazzViteConfig()` handles worker format, `jazz-wasm` optimizer exclusion, SSR externalization, and alias resolution; it does not install a WASM ESM transform plugin.

## WhoDB double-check

WhoDB remains useful for database navigation, CRUD discoverability, filters, and E2E organization. None of those require adopting its GraphQL/SQL source architecture.

## Merge gate

Browser E2E remains mandatory. Unit tests alone cannot validate the published worker/WASM/embedded runtime path or two-writer realtime behavior.
