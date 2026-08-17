# PR #4 review — merge hardening

PR: `#4 feat: add Jazz Admin Inspector plan and WhoDB-inspired shell`

## Verdict

The core architecture is correct: retain runtime schema discovery, generic Jazz queries, reactive reads, and Jazz mutations. WhoDB should influence navigation density, CRUD discoverability, destructive-action UX, and test organization—not the backend data layer.

## CI evidence reviewed

Original failing run:
- root MCP passed;
- Inspector unit tests: 84 passed;
- TypeScript/build passed;
- Vercel build passed;
- Playwright: 12 passed, 1 failed (embedded overlay WASM transform).

First hardening run after adding both WASM and top-level-await plugins:
- Inspector unit tests: 84 passed;
- `pnpm build` failed before Playwright;
- failure came from `vite-plugin-top-level-await` SWC printing (`missing field type`) while bundling the Jazz worker.

The revised fix keeps `vite-plugin-wasm`, targets `esnext`, and removes the incompatible TLA rewrite plugin from the active graph.

## Bugs found

### P0 — embedded overlay Jazz WASM path

Preserve Jazz's `buildJazzViteConfig()` and add the consumer-side WASM ESM transform required by the extracted published-package worker graph. Use fresh WASM plugin instances for worker builds and `build.target = "esnext"` so the generated top-level await remains native.

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
