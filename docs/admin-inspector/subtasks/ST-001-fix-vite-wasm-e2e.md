# ST-001 — Fix Vite WASM browser E2E

Parent: Task 00
Priority: P0
Status: implemented in this PR update

## Problem

`pnpm test:browser` passed 12 tests and failed the embedded overlay test. The Vite dev server failed while transforming the published Jazz worker graph:

```text
"ESM integration proposal for Wasm" is not supported currently
```

The failing request was the test Jazz worker; the host never reached `Host ready`.

## Root cause

`buildJazzViteConfig()` correctly excludes/aliases `jazz-wasm` and sets ES worker format, but it does not install a WASM ESM transform. The repository already has `vite-plugin-wasm` and `vite-plugin-top-level-await` in dev dependencies.

## Implementation

- [x] import both plugins in `vite.config.ts`;
- [x] create a factory returning fresh plugin instances;
- [x] apply them to the normal Vite plugin graph;
- [x] apply them through `worker.plugins: () => [...]`;
- [x] preserve Jazz aliases, optimizer exclusion, test worker aliases, and stable test WASM middleware;
- [ ] verify the new GitHub Actions run is green.

## Acceptance

The embedded overlay host starts, its Jazz worker loads, and all Playwright tests pass without disabling the test or weakening its assertions.
