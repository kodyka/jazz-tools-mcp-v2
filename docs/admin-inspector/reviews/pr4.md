# PR #4 review — merge hardening

PR: `#4 feat: add Jazz Admin Inspector plan and WhoDB-inspired shell`

## Verdict

The core architecture is correct: retain runtime schema discovery, generic Jazz queries, reactive reads, and Jazz mutations. WhoDB should influence navigation density, CRUD discoverability, destructive-action UX, and test organization—not the backend data layer.

## CI evidence reviewed

For the reviewed failing run:

- root MCP job passed;
- Inspector unit tests: 84 passed;
- TypeScript/build passed;
- Vercel build passed and produced `dist/index.html`;
- Playwright: 12 passed, 1 failed.

The single failure was the embedded overlay E2E. The Vite dev server rejected WebAssembly ESM integration while transforming the published Jazz worker graph.

## Bugs found

### P0 — embedded overlay E2E cannot load Jazz WASM

The project already depended on `vite-plugin-wasm` and `vite-plugin-top-level-await`, but `vite.config.ts` did not install them. Fix both the normal dev graph and worker build graph while preserving `buildJazzViteConfig()` alias/optimizer behavior. See ST-001 and `snippets/vite-wasm-runtime.md`.

### P1 — grid toolbar schema route still has a raw runtime table segment

Sidebar/relation paths are encoded, but the grid toolbar still contains:

```tsx
to={`/data-explorer/${table}/schema`}
```

Patch it to `encodeURIComponent(table)` and add a regression test with `todos/archived #1`. See ST-002 and `snippets/route-safety.md`.

### P1 — `useAll()` compatibility logic is duplicated

Main grid and relation-cell code both branch between legacy array/undefined results and current structured query state. Move that compatibility to `normalizeUseAllResult()` and test both API shapes. See ST-003 and `snippets/use-all-normalizer.md`.

## Double-check against upstream Jazz

Current upstream Inspector uses the structured `useAll()` state. `buildJazzViteConfig()` handles worker format, `jazz-wasm` optimizer exclusion, SSR externalization, and alias resolution; it does not install a WASM ESM transform plugin. Therefore the extracted published-package setup needs a consumer-side transform for its E2E worker graph.

## Double-check against WhoDB

WhoDB's storage-unit area confirms the useful interaction model: data workspace, add/delete operations, typed filtering, schema/object navigation, and dedicated E2E coverage. None of that requires adopting WhoDB's GraphQL/SQL source abstraction.

## Merge gate

Do not merge solely because unit/build checks are green. Browser E2E is required because it validates the worker/WASM/embedded runtime path and two-writer realtime behavior.
