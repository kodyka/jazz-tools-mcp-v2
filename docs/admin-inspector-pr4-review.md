# PR #4 technical review and executable hardening plan

PR: `#4 feat: add Jazz Admin Inspector plan and WhoDB-inspired shell`

This document is the implementation-oriented review companion to `docs/admin-inspector-mvp-plan.md`. It records the bugs found during the PR review, the fixes applied directly to the PR branch, and the next work split into small mergeable subtasks with concrete code shapes and acceptance checks.

## Review sources

The review was cross-checked against three sources rather than relying only on the PR description:

1. the code changed in PR #4;
2. the current Jazz v2 Inspector/docs implementation, reviewed against `garden-co/jazz` at commit `fa7d33b3ecfc9fcb673cd7c7bb9c35d700255e1d`;
3. the current WhoDB frontend patterns in `clidey/whodb`, especially its sidebar, storage-unit explorer, schema UI, and browser E2E organization.

WhoDB remains a UX/testing reference only. Its SQL/GraphQL source abstraction must not replace the Jazz-native runtime/query/mutation layer.

---

# 1. Review verdict

The architectural decision in PR #4 is correct:

```text
Jazz runtime schema
      ↓
GenericQueryBuilder
      ↓
useAll()
      ↓
react-data-grid
      ↓
Db.insert / update / delete
      ↓
Jazz sync
```

The PR should continue to fork the Inspector rather than adapt a conventional SQL admin client.

The first shell pass is useful, but the original PR state had four merge-blocking or release-blocking gaps:

1. browser E2E was not run in CI, even though the shell changed selectors used by Playwright;
2. the UI claimed `LIVE` / `Realtime sync active` without observing actual transport health;
3. table names were interpolated directly into route path segments, and a schema switch could leave the router on a table absent from the new runtime schema;
4. the extracted Inspector retained a Jazz-monorepo-only Vercel build command that references directories/tools not present in this repository.

All four are addressed on the PR branch by the review patch set.

---

# 2. Fixes applied during this review

## Fix A — extracted Vercel build is self-contained

### Problem

The copied package still used the upstream monorepo build command:

```json
{
  "build:vercel": "bash ../../dev/scripts/install-vercel-deps.sh && pnpm --dir ../.. exec turbo run build:crates --filter=@jazz/rust && pnpm --dir ../.. exec turbo run build --filter=jazz-wasm && pnpm --dir ../.. exec turbo run build --filter=jazz-tools --only && pnpm run build:web"
}
```

Those `../../dev`, Turbo, Rust workspace, and sibling `jazz-tools` paths are not part of `jazz-tools-mcp-v2`. `vercel.json` invokes `pnpm build:vercel`, so a deployment would fail even though `pnpm build` passed locally.

### Applied fix

```json
{
  "build:vercel": "tsc -b && pnpm run build:web"
}
```

### Acceptance

```bash
cd packages/inspector
pnpm install --frozen-lockfile
pnpm build:vercel
```

must succeed from this repository without the Jazz monorepo checked out next to it.

---

## Fix B — do not display unobserved sync health

### Problem

The shell rendered a green animated badge labelled `Live` whenever a standalone connection configuration existed, and the sidebar rendered:

```text
Realtime sync     ACTIVE
```

That state only proved that the app had a configured Jazz client. It did not prove that the WebSocket was currently connected, that the edge was reachable, or that a write could reach the requested durability tier.

A database admin UI must not turn configuration state into a health assertion.

### Applied fix

The header now identifies the configured Jazz app without claiming transport health:

```tsx
{connection ? (
  <div
    className={styles.liveConnection}
    aria-label="Jazz connection configuration"
    title={`${serverHost(connection.serverUrl)} · ${connection.appId}`}
  >
    <span className={styles.liveLabel}>Jazz</span>
    <span className={styles.connectionApp}>{shortAppId(connection.appId)}</span>
  </div>
) : null}
```

The sidebar now describes the capability rather than health:

```tsx
<div className={styles.sidebarFooter}>
  <span className={styles.realtimeDot} aria-hidden="true" />
  <span>Reactive table data</span>
  <span className={styles.realtimeState}>Jazz</span>
</div>
```

### Follow-up rule

Only add `Connected`, `Offline`, `Reconnecting`, `Last synced`, or similar labels after a supported Jazz API exposes the signal being displayed.

Do **not** infer health from:

- existence of `serverUrl`;
- existence of `JazzClient`;
- presence of rows in local storage;
- a successful connection that happened minutes earlier.

---

## Fix C — encode dynamic table routes and recover from schema changes

### Problem 1: raw path segments

The original shell generated links with raw runtime table names:

```tsx
to={`/data-explorer/${table.name}/data`}
```

Runtime-discovered object names should be treated as data, not trusted route syntax.

### Applied route helper

```ts
type TableView = "data" | "schema";

function tablePath(tableName: string, view: TableView): string {
  return `/data-explorer/${encodeURIComponent(tableName)}/${view}`;
}
```

Used for both data and schema links:

```tsx
<NavLink to={tablePath(table.name, "data")}>...</NavLink>
<NavLink to={tablePath(table.name, "schema")}>...</NavLink>
```

Relation navigation is encoded independently:

```ts
return `/data-explorer/${encodeURIComponent(table)}/data?${params.toString()}`;
```

The relation row ID remains inside `URLSearchParams`; it is not modified as a table-path segment.

### Problem 2: stale route after schema switch

If the operator was viewing `old_table`, then selected a schema version where `old_table` no longer existed, the previous implementation retained the stale `:table` route.

### Applied recovery

```tsx
useEffect(() => {
  if (tableNames.length === 0) return;

  if (!table || !tableNames.includes(table)) {
    navigate(tablePath(tableNames[0], "data"), { replace: true });
  }
}, [table, tableNames, navigate]);
```

This covers both initial `/data-explorer` navigation and schema-version changes that invalidate the current table.

### Added tests

- special-character table names produce encoded data/schema links;
- relation navigation encodes table names without altering relation IDs;
- an absent selected table redirects to the first valid runtime table.

---

## Fix D — browser/realtime E2E is now a CI gate

### Problem

The PR changed the sidebar heading from `Tables` to `Database`, but the copied Playwright suite still asserted:

```ts
page.getByRole("heading", { name: "Tables" })
```

The PR's CI only ran:

```text
pnpm test
pnpm build
```

so the browser suite could be broken while CI stayed green.

### Applied CI gate

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm test
- run: pnpm build
- name: Install Playwright Chromium
  run: pnpm exec playwright install --with-deps chromium
- name: Run Inspector browser E2E
  run: pnpm test:browser
```

The stale selector was updated to `Database`.

### Added two-writer realtime E2E

This is the key Jazz-specific acceptance test:

```ts
test("reacts to insert, update, and delete from a second Jazz writer without refresh", async ({
  page,
}) => {
  const context = createJazzContext({
    appId: APP_ID,
    app,
    permissions,
    driver: { type: "memory" },
    serverUrl: SERVER_URL,
    backendSecret: TEST_BACKEND_SECRET,
    env: TEST_ENV,
    userBranch: TEST_BRANCH,
    defaultDurabilityTier: "global",
  });

  const externalWriter = context.asBackend();
  const title = `External realtime ${Date.now()}`;

  try {
    const created = externalWriter.insert(app.todos, { title, done: false });
    await created.wait({ tier: "global" });

    const externalRow = rowByTitle(page, title);
    await expect(externalRow).toBeVisible({ timeout: 15_000 });

    await externalWriter
      .update(app.todos, created.id, { done: true })
      .wait({ tier: "global" });
    await expect(externalRow.getByRole("checkbox")).toBeChecked({ timeout: 15_000 });

    await externalWriter.delete(app.todos, created.id).wait({ tier: "global" });
    await expect(externalRow).toHaveCount(0, { timeout: 15_000 });
  } finally {
    await context.shutdown();
  }
});
```

This proves the product requirement directly:

```text
writer B -> Jazz server -> writer A subscription -> browser grid
```

without REST polling or a page reload.

---

# 3. Jazz API compatibility review

The extracted Inspector currently targets the published `jazz-tools@alpha` package while upstream Inspector is developed against the Jazz workspace package.

The current Jazz React documentation describes:

```ts
const { data, isLoading, error } = useAll(query);
```

The fork currently contains a compatibility bridge because the installed alpha snapshot used by the repository may expose the older array/undefined result shape.

Current compatibility code:

```ts
const queryResult = useAll<DynamicTableRow>(queryBuilder, queryOptions);
const legacyQueryResult = queryResult as unknown as
  | { data?: DynamicTableRow[]; isLoading?: boolean }
  | undefined;

const rows = Array.isArray(queryResult)
  ? queryResult
  : (legacyQueryResult?.data ?? EMPTY_ROWS);
```

This is acceptable as a short-term extraction shim, but it should not remain duplicated in every query call site.

## Task API-1 — normalize `useAll` result shape in one helper

Priority: **next small PR or follow-up commit after browser CI is green**.

Create:

```text
packages/inspector/src/utility/normalize-use-all-result.ts
```

Suggested implementation:

```ts
export interface QueryStateLike<T> {
  data?: T[];
  isLoading?: boolean;
  error?: unknown;
}

export interface NormalizedQueryState<T> {
  data: T[];
  isLoading: boolean;
  error: unknown;
}

export function normalizeUseAllResult<T>(result: unknown): NormalizedQueryState<T> {
  if (Array.isArray(result)) {
    return {
      data: result as T[],
      isLoading: false,
      error: undefined,
    };
  }

  if (result === undefined) {
    return {
      data: [],
      isLoading: true,
      error: undefined,
    };
  }

  const state = result as QueryStateLike<T>;
  return {
    data: state.data ?? [],
    isLoading: state.isLoading ?? state.data === undefined,
    error: state.error,
  };
}
```

Use it in both the main grid and relation cell:

```ts
const queryResult = useAll<DynamicTableRow>(queryBuilder, queryOptions);
const { data: rows, isLoading: isInitialLoading, error } =
  normalizeUseAllResult<DynamicTableRow>(queryResult);
```

Unit tests must cover:

```ts
undefined
[]
[ row ]
{ data: undefined, isLoading: true }
{ data: [], isLoading: false }
{ data: [row], isLoading: false }
{ data: [], isLoading: false, error }
```

### Exit condition

Remove this helper once the repository pins a Jazz version whose React result contract is stable and the old result shape is no longer supported.

---

# 4. Detailed work breakdown after PR #4

The tasks below are intentionally small. Do not combine unrelated product features into a single large PR.

## Track A — PR #4 merge hardening

### A1 — browser CI

Status: **implemented in this review**.

Subtasks:

- [x] install Chromium in GitHub Actions;
- [x] execute existing Inspector Playwright suite;
- [x] update shell selector from `Tables` to `Database`;
- [x] add second-writer insert/update/delete test;
- [ ] inspect the first CI run and fix any environment-only failure;
- [ ] require both root MCP and Inspector jobs before merge.

Acceptance:

```text
root test job: green
Inspector unit/build job: green
Inspector browser E2E: green
```

### A2 — extraction/deployment correctness

Status: **implementation complete; CI/deployment command verification pending**.

Subtasks:

- [x] remove upstream monorepo aliases from Vitest;
- [x] make `build:vercel` repository-local;
- [ ] run `pnpm build:vercel` in CI or a deployment preview;
- [ ] add a smoke assertion that `dist/index.html` exists.

Suggested CI step:

```yaml
- name: Verify standalone deployment build
  run: pnpm build:vercel && test -f dist/index.html
```

### A3 — navigation correctness

Status: **implemented in this review**.

Subtasks:

- [x] encode table path segments;
- [x] encode relation target table path segments;
- [x] preserve row IDs inside query parameters;
- [x] redirect stale table routes after schema switch;
- [x] add unit coverage.

### A4 — status semantics

Status: **implemented for current shell**.

Subtasks:

- [x] remove `Live` health claim from header;
- [x] remove `ACTIVE` transport claim from sidebar;
- [ ] add a real connection-state indicator only when Jazz exposes a supported signal;
- [ ] if a `/health` check is added later, label it as server reachability, not sync-subscription health.

---

## Track B — admin safety and ergonomics

### B1 — multi-row delete confirmation

Priority: high.

WhoDB uses destructive confirmation UI for dangerous operations. Jazz Admin should do the same while preserving staged mutations.

Desired flow:

```text
select 3 persisted rows
      ↓
Delete selected
      ↓
confirmation dialog
  "Queue deletion of 3 rows?"
  [Cancel] [Queue deletion]
      ↓
queued changes rail
      ↓
Save changes
```

Do **not** delete immediately from the confirmation dialog. The dialog only queues the staged delete.

Suggested state:

```ts
const [deleteConfirmation, setDeleteConfirmation] = useState<{
  persistedIds: string[];
  stagedInsertIds: string[];
} | null>(null);
```

Suggested action split:

```ts
function requestDeleteSelected() {
  const persistedIds = [...selectedRowIds].filter((id) => !id.startsWith("staged:"));
  const stagedInsertIds = [...selectedRowIds].filter((id) => id.startsWith("staged:"));

  if (persistedIds.length > 1) {
    setDeleteConfirmation({ persistedIds, stagedInsertIds });
    return;
  }

  queueSelectedRowsForDeletion();
}
```

Acceptance tests:

- one persisted row can be queued without an ambiguous bulk warning;
- two or more persisted rows require explicit confirmation;
- cancel changes nothing;
- confirm queues but does not persist;
- `Discard` restores queued deletions;
- `Save changes` persists them.

### B2 — copy row/cell actions

Priority: medium.

Subtasks:

- [ ] copy row ID;
- [ ] copy cell value;
- [ ] copy row as JSON;
- [ ] keyboard accessible menu;
- [ ] no secret/system credential fields copied implicitly.

Suggested helper:

```ts
async function copyText(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  await navigator.clipboard.writeText(text);
}
```

### B3 — connection/environment identity

Priority: medium.

Extend the standalone context with non-secret metadata:

```ts
export interface StandaloneConnectionConfig {
  name: string;
  serverUrl: string;
  appId: string;
  env: string;
  branch: string;
  adminSecret: string;
}
```

Header display:

```text
Local dev · dev/main · 019d9bc9…
```

Rules:

- never display `adminSecret`;
- production-looking environments should eventually have a warning style;
- environment identity is configuration metadata, not health state.

---

## Track C — agent/provenance UX

### C1 — provenance preset

Priority: high after merge hardening.

Current useful fields:

```text
$createdAt
$createdBy
$updatedAt
$updatedBy
```

Add a named column preset:

```ts
const AGENT_ACTIVITY_COLUMNS = [
  "id",
  "$createdAt",
  "$createdBy",
  "$updatedAt",
  "$updatedBy",
] as const;
```

Suggested UI:

```text
Columns ▾
  Default
  Agent activity
  All
```

Acceptance:

- selecting `Agent activity` is reversible;
- normal schema columns are not destroyed from saved preferences;
- writer IDs remain raw/copyable even if a friendly display label is added.

### C2 — provenance filters

Use the same typed Jazz filter path as ordinary columns; do not build a separate agent-query API.

Example:

```ts
builder.where({
  $updatedBy: { eq: selectedWriterId },
});
```

If `contains` is not supported for the actual provenance column type in the pinned Jazz version, do not fake it in the UI. Derive operators from the runtime descriptor/operator map.

### C3 — row detail drawer

A detail drawer should show:

```text
Row ID
schema fields
relations
created at/by
updated at/by
pending local edits
```

History/diff belongs in a later milestone once a supported row-history API is stable.

---

## Track D — schema and relationship experience

### D1 — relation display quality

Subtasks:

- [ ] keep relation target lookup reactive;
- [ ] show target ID even if friendly display query fails;
- [ ] never make a relation-cell failure crash the whole grid;
- [ ] use encoded table routes;
- [ ] add relation navigation E2E.

### D2 — schema graph, later

WhoDB has a useful visual graph, but it is not an MVP dependency.

Jazz graph input must come from `WasmSchema`, not SQL foreign-key introspection:

```ts
interface SchemaGraphEdge {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
}

function schemaEdges(schema: WasmSchema): SchemaGraphEdge[] {
  return Object.entries(schema).flatMap(([tableName, table]) =>
    table.columns.flatMap((column) => {
      const targetTable = getReferencedTable(column);
      return targetTable
        ? [{ sourceTable: tableName, sourceColumn: column.name, targetTable }]
        : [];
    }),
  );
}
```

The exact reference descriptor must be read from the pinned Jazz runtime type rather than guessed.

---

## Track E — production security boundary

The current standalone mode is a privileged operator/developer tool. `adminSecret` bypasses normal app permissions and is persisted in browser local storage by the copied Inspector flow.

Do not expose that architecture as an internet-facing admin SaaS.

### E1 — BFF contract

Target:

```text
browser admin UI
   ↓ authenticated session
Jazz Admin BFF
   ↓ backend/admin credentials
Jazz server
```

The browser should receive a normal application/admin session, not the infrastructure secret.

### E2 — authorization

At minimum define:

```ts
type AdminCapability =
  | "data:read"
  | "data:insert"
  | "data:update"
  | "data:delete"
  | "schema:read"
  | "permissions:read";
```

Do not collapse every operator into an all-powerful browser secret just because Inspector development mode does so.

### E3 — audit

For privileged admin mutations record:

```text
operator identity
request ID
app/environment
schema hash
operation
row/table identifiers
timestamp
result/error
```

Do not log secrets or full sensitive row payloads by default.

---

# 5. Recommended PR split

After PR #4 is green, use this sequence.

## PR #5 — compatibility + admin safety

Scope:

- `normalizeUseAllResult` helper and tests;
- multi-row delete confirmation;
- connection/environment summary;
- build:vercel CI smoke check.

Do not include schema graph or history.

## PR #6 — agent/provenance workflow

Scope:

- Agent activity column preset;
- `$createdBy/$updatedBy` filters using supported operators;
- copy row ID/cell actions;
- row detail drawer.

Acceptance demo:

```text
MCP insert -> row appears -> $createdBy visible
MCP update -> cell updates -> $updatedBy visible
operator filters to that writer
```

## PR #7 — production boundary

Scope only after deployment/auth decision:

- BFF/session design;
- privileged credential moved server-side;
- operator authorization;
- audit log;
- production environment warnings.

## PR #8 — advanced Jazz-native inspection

Only after Jazz APIs are stable enough:

- row history/diff;
- branches;
- schema graph;
- permission viewer enhancements;
- migration/schema history.

---

# 6. Test matrix

## Unit

```text
App connection migration
schema selector
sidebar search
encoded routes
stale route recovery
relation navigation
filter parser
mutation value parser
useAll compatibility normalizer
bulk delete state machine
column presets
```

## Browser E2E

```text
connect with admin credentials
load named connection
search table navigator
open data
open schema
inline edit + discard
inline edit + save
boolean edit + save
filter
insert + save
delete + save
second Jazz writer insert
second Jazz writer update
second Jazz writer delete
schema switch with removed current table
```

## Root MCP integration

Keep the existing real Jazz integration test for:

```text
status
schema/table discovery
query
get row
insert
update
delete
write-disable safety
```

## Deployment

```bash
cd packages/inspector
pnpm build
pnpm build:vercel
test -f dist/index.html
test -f dist-embedded/index.html
```

---

# 7. Merge checklist for PR #4

Do not merge based only on the old `80/80` unit-test result.

Required current-head checks:

- [ ] root `npm run check`;
- [ ] root `npm test`;
- [ ] root `npm run build`;
- [ ] Inspector `pnpm test`;
- [ ] Inspector `pnpm build`;
- [ ] Playwright Chromium installation;
- [ ] Inspector `pnpm test:browser`;
- [ ] second-writer realtime test passes;
- [ ] `pnpm build:vercel` succeeds;
- [ ] no unresolved PR review thread;
- [ ] PR remains mergeable after the final head commit.

Only after those checks is the PR a reliable Milestone A foundation.

---

# 8. Design rules retained from the original plan

1. Jazz-native data semantics beat generic SQL-admin conventions.
2. Runtime schema remains the source of truth for unknown tables.
3. Table data is reactive via Jazz subscriptions; do not add polling as a substitute.
4. A status badge must describe a signal the application actually observes.
5. Destructive changes should remain staged and reviewable.
6. Provenance should be visible because agent activity is a first-class use case.
7. Keep product-shell changes isolated enough that upstream Inspector fixes remain portable.
8. WhoDB is a UX/test reference, not a data-layer dependency.
9. Every realtime claim should have a two-writer automated test.
10. Before a tagged release, pin and document the verified Jazz version pair instead of relying on a moving alpha tag.
