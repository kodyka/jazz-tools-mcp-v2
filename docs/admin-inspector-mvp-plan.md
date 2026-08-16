# Jazz Admin Inspector MVP — detailed implementation plan

Status: implementation plan for `packages/inspector`

Primary code foundation: the official Jazz v2 Inspector fork already vendored into this repository.

Primary UX reference: WhoDB. Secondary references may be used later, but the MVP should first copy the *interaction priorities* of WhoDB (clear database navigation, searchable objects, obvious CRUD actions, schema access, compact admin-tool density) while keeping Jazz-native data access.

> Important: do not replace the Inspector data layer with a SQL/REST abstraction. Jazz is a local-first relational database with query-driven sync, row-level permissions, runtime schema information, deep write provenance, and schema-version semantics. The admin UI should use those primitives directly.

---

## 1. Product goal

Build a simple standalone admin application for a Jazz database where an operator can:

1. connect to a Jazz server/app;
2. see every runtime table without hard-coded app models;
3. see rows change in real time while another browser, server, or MCP agent writes to Jazz;
4. create rows;
5. edit cells/rows;
6. delete rows;
7. filter, sort, paginate, and choose visible columns;
8. inspect a table's schema and relations;
9. see Jazz provenance fields such as `$createdAt`, `$createdBy`, `$updatedAt`, and `$updatedBy`;
10. switch schema versions and connections during development;
11. later inspect agent activity/history without rebuilding the database layer.

The first demo should make this flow obvious:

```text
MCP agent / app client / backend
            |
            | Jazz write
            v
      jazz-tools@alpha server
            |
            | sync
            v
      Jazz Admin Inspector
            |
            +--> row appears or changes immediately
            +--> changed row/cell is highlighted
            +--> provenance shows who/what wrote it
```

The reverse flow must also work:

```text
Jazz Admin Inspector
      |
      | insert / update / delete
      v
Jazz local replica -> sync server -> MCP query / another client
```

---

## 2. Why fork Jazz Inspector instead of building a new admin panel

The current Inspector already owns the difficult Jazz-specific pieces:

- runtime schema discovery;
- generic table discovery;
- generic query construction for tables unknown at compile time;
- reactive row reads;
- typed filter construction;
- sorting and pagination;
- inline editing;
- staged inserts;
- staged deletes;
- relation navigation;
- schema display;
- schema version selection;
- standalone and embedded modes;
- real-time row/cell animation when synced data changes.

The MVP should therefore keep this path intact:

```text
fetchSchemaHashes / fetchStoredWasmSchema
                |
                v
             WasmSchema
                |
       Object.keys(schema)
                |
                v
          table navigator
                |
                v
      GenericQueryBuilder
                |
                v
              useAll()
                |
                v
          react-data-grid
                |
        Db.insert/update/delete
```

WhoDB is a UX reference, not the backend architecture. The useful WhoDB ideas for this fork are:

- a strong database-object sidebar;
- object search close to the sidebar;
- clear hierarchy and breadcrumbs;
- obvious add/edit/delete entry points;
- schema access next to data access;
- compact, information-dense admin UI;
- a dedicated data-exploration workspace rather than a developer-debugger feel.

---

## 3. MVP scope

### In scope

- standalone Inspector mode;
- existing embedded mode must continue to compile;
- connections screen;
- schema selection;
- searchable table sidebar;
- data grid;
- live/realtime status indicators;
- insert/update/delete;
- filter/sort/page;
- schema view;
- relation navigation;
- provenance columns;
- keyboard-accessible admin controls;
- tests for the shell and core CRUD path;
- Nix/macOS developer workflow.

### Explicitly not in MVP

- arbitrary SQL;
- raw SQLite access;
- editing Jazz schema from the browser;
- editing permissions from the browser;
- migration creation/deployment from the browser;
- production-grade secret storage in frontend localStorage;
- end-user RLS impersonation UI;
- full historical diff viewer;
- branch merge UI;
- AI chat UI;
- copying WhoDB's backend/plugin architecture.

Those can be separate milestones after the admin browser is stable.

---

# 4. Architecture

## 4.1 Runtime topology

```text
+--------------------------------------------------------------+
| Jazz Admin Inspector (React/Vite)                            |
|                                                              |
|  connection manager                                          |
|       |                                                      |
|       +--> schema catalogue                                  |
|       |      fetchSchemaHashes()                             |
|       |      fetchStoredWasmSchema()                         |
|       |                                                      |
|       +--> createJazzClient()                                |
|                    |                                         |
|                    v                                         |
|             local Jazz runtime                               |
|                    |                                         |
|       +------------+-------------+                           |
|       |                          |                            |
|       v                          v                            |
|  GenericQueryBuilder       Db.insert/update/delete            |
|       |                          |                            |
|       v                          v                            |
|     useAll()                durability wait                  |
|       |                          |                            |
|       +-----------+--------------+                            |
|                   |                                           |
+-------------------|-------------------------------------------+
                    | WebSocket sync
                    v
             jazz-tools@alpha server
                    |
          other apps / agents / MCP
```

## 4.2 Important Jazz-specific rule

Do not build CRUD by directly calling internal server HTTP endpoints or SQLite. The admin app should behave as a Jazz client/runtime.

That preserves:

- sync semantics;
- visibility semantics;
- version/provenance metadata;
- relation/query behavior;
- compatibility with the current alpha server.

## 4.3 Realtime model

The existing grid uses a reactive Jazz query. Conceptually:

```tsx
const query = new GenericQueryBuilder(table, schema)
  .where(where)
  .orderBy(orderBy)
  .limit(pageSize + 1)
  .offset(page * pageSize);

const result = useAll(query, {
  propagation: runtime === "standalone" ? "full" : "local-only",
});

const rows = result.data ?? [];
```

No manual polling should be introduced for table data.

---

# 5. UX direction — WhoDB first

The goal is not to reproduce WhoDB pixel-for-pixel. The goal is to adopt the useful database-admin interaction model while retaining the Inspector's Jazz-native implementation.

## 5.1 Shell

Target layout:

```text
+--------------------------------------------------------------------------------+
| ◇ Jazz Admin | Database / todos     [LIVE] app-id     [Schema v...] [Connections]|
+----------------------+---------------------------------------------------------+
| DATABASE             | todos                                                   |
| [ Search tables... ] | [filters................] [Live] [schema] [+] [delete]  |
|                      +---------------------------------------------------------+
| ▦ todos          5   | id       title       done      $updatedAt      actions  |
| ▦ projects       8   | ------------------------------------------------------- |
| ▦ users          7   | ... realtime rows ...                                  |
|                      |                                                         |
|                      |                                                         |
|                      +---------------------------------------------------------+
| ● Realtime sync      | Queued changes / pagination                             |
+----------------------+---------------------------------------------------------+
```

## 5.2 Visual priorities

1. The operator should always know **which database/app** is open.
2. The selected table should be visually obvious.
3. Live/realtime state should be visible but not distracting.
4. Create/delete/schema controls must be easy to discover.
5. Table search should be immediate and local.
6. Dense data must have more space than chrome.
7. Development credentials must never be displayed in full.

## 5.3 Sidebar

WhoDB-inspired behavior:

- section title: `Database`;
- total table count;
- search field;
- table icon;
- table name;
- column count;
- selected state;
- direct schema link;
- realtime status at bottom.

Suggested component shape:

```tsx
interface TableNavigationItem {
  name: string;
  columnCount: number;
}

function TablesSidebar({ tables, selectedTableName }: Props) {
  const [search, setSearch] = useState("");
  const visibleTables = tables.filter((table) =>
    table.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <aside>
      <header>
        <span>Database</span>
        <span>{tables.length} tables</span>
      </header>
      <input
        aria-label="Search tables"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search tables..."
      />
      {/* links */}
    </aside>
  );
}
```

---

# 6. Work breakdown

## Phase 0 — preserve the upstream Inspector boundary

### Task 0.1 — document the fork source

- [ ] Record upstream Jazz commit/version used for the Inspector snapshot.
- [ ] Keep the original MIT attribution/license.
- [ ] Note which files are changed for the Jazz Admin product shell.
- [ ] Keep WhoDB listed as UX inspiration only.

Acceptance:

- it remains possible to compare the fork to the Jazz Inspector source;
- future upstream Inspector fixes can be cherry-picked or manually ported.

### Task 0.2 — isolate product-only UI changes

Prefer product UI files under existing shell components rather than changing query/mutation internals.

Primary files:

```text
packages/inspector/src/components/inspector-layout/
packages/inspector/src/pages/data-explorer/
packages/inspector/src/styles/
```

Avoid unnecessary changes to:

```text
utility/generic-query-builder.ts
row-mutation-form.ts
relation-navigation.ts
Jazz runtime setup
```

---

## Phase 1 — WhoDB-inspired admin shell

### Task 1.1 — brand the standalone shell

- [x] Add a compact `Jazz Admin` brand block.
- [x] Keep existing Data Explorer / Subscriptions navigation.
- [x] Add database/table breadcrumb derived from the route.
- [x] Add a live connection indicator in standalone mode.
- [x] Show app/server identity without exposing the admin secret.

Example:

```tsx
const selectedTable = location.pathname.startsWith("/data-explorer/")
  ? location.pathname.split("/")[2]
  : undefined;

<span className={styles.breadcrumbs}>
  <span>Database</span>
  {selectedTable ? <><span>/</span><strong>{selectedTable}</strong></> : null}
</span>
```

### Task 1.2 — keep overlay compatibility

- [ ] Embedded Inspector must continue to render.
- [ ] Close button remains available in overlay mode.
- [ ] Standalone-only connection information must be conditional.

Acceptance:

```bash
cd packages/inspector
pnpm test
pnpm build
```

must pass.

---

## Phase 2 — database object navigation

### Task 2.1 — searchable tables

- [x] Add local table search.
- [x] Match case-insensitively.
- [x] Show a useful empty result when nothing matches.
- [ ] Add keyboard focus shortcut (`/`) later.

### Task 2.2 — table metadata

For each table show:

- [x] name;
- [x] column count;
- [x] data route;
- [x] schema route;
- [ ] relationship count later.

Data is already available in `WasmSchema`:

```tsx
const tables = Object.entries(schema).map(([name, definition]) => ({
  name,
  columnCount: definition.columns.length,
}));
```

### Task 2.3 — selected state

Selected table row should remain obvious while switching between data/schema views.

Routes remain:

```text
/data-explorer/:table/data
/data-explorer/:table/schema
```

---

## Phase 3 — realtime data workspace

### Task 3.1 — make realtime behavior visible

The Inspector already detects row additions, row removals, and changed cells. Keep those animations.

- [x] Add visible realtime status in app shell/sidebar.
- [ ] Add a compact `Live` badge to the data toolbar in a follow-up if useful.
- [ ] Add `Last sync event` diagnostics only if the runtime exposes a stable API.

Do **not** implement websocket event listeners outside Jazz just to drive UI chrome.

### Task 3.2 — realtime demo acceptance test

Manual test:

1. open `todos` in the admin UI;
2. open another Jazz client or MCP client;
3. insert a todo;
4. verify the new row appears without browser refresh;
5. update the row externally;
6. verify the changed cell flashes;
7. delete the row externally;
8. verify it disappears/animates out.

MCP example sequence:

```json
// jazz_insert
{
  "table": "todos",
  "values": {
    "title": "created by MCP while admin UI is open",
    "done": false
  }
}
```

Then:

```json
// jazz_update
{
  "table": "todos",
  "id": "<returned-id>",
  "values": {
    "done": true
  }
}
```

Then:

```json
// jazz_delete
{
  "table": "todos",
  "id": "<returned-id>"
}
```

Expected: all three state transitions are visible live in the grid.

---

## Phase 4 — CRUD UX

The current grid already stages changes before committing. Preserve that because it is a good database-admin safety model.

### Task 4.1 — insert row

Current target flow:

```text
click +
  -> staged blank row appears
  -> user edits fields
  -> queued change banner appears
  -> Save changes
  -> db.insert(...).wait({ tier })
```

Core Jazz shape:

```ts
await db
  .insert(tableProxy, values)
  .wait({ tier: runtime === "standalone" ? "edge" : "local" });
```

Subtasks:

- [x] schema-driven fields;
- [x] defaults respected;
- [x] nullable columns supported;
- [x] booleans edited appropriately;
- [x] read-only fields excluded;
- [ ] improve required-field error copy.

### Task 4.2 — update row

Current target flow:

```text
click/edit cell
  -> parse according to Jazz column type
  -> stage cell
  -> highlight pending state
  -> Save changes
  -> db.update()
```

Example:

```ts
await db
  .update(tableProxy, rowId, {
    title: "edited from Jazz Admin",
  })
  .wait({ tier: "edge" });
```

### Task 4.3 — delete rows

Current target flow:

```text
select rows
  -> Delete selected
  -> rows are queued
  -> Save changes
  -> db.delete()
```

Follow-up improvement:

- [ ] explicit destructive confirmation when > 1 persisted row is selected;
- [ ] show IDs or row count in confirmation;
- [ ] allow cancel.

### Task 4.4 — queued changes rail

Keep this behavior as a product feature:

```text
Queued
3 edits across 2 rows
1 row will be deleted
1 staged insert

[Discard] [Save changes]
```

Do not auto-save every keystroke in the admin product.

---

## Phase 5 — filters, sorting, pagination

### Task 5.1 — typed filters

Keep `TableFilterBuilder` and the Jazz where-operator mapping.

Example request state:

```json
{
  "done": false,
  "title": { "contains": "MCP" },
  "$updatedAt": { "gte": 1760000000000 }
}
```

### Task 5.2 — URL-addressable explorer state

Keep filters/sort/page in search params so table views can be shared/reloaded.

Example:

```text
/data-explorer/todos/data?sort=$updatedAt&dir=DESC&pageSize=25
```

### Task 5.3 — search ergonomics

- [ ] global command palette later;
- [ ] quick table jump later;
- [ ] saved filters later.

---

## Phase 6 — schema and relationships

### Task 6.1 — table schema

Keep the existing schema definition view.

Show at minimum:

- column name;
- type;
- nullable;
- default;
- enum values;
- reference target;
- writable/read-only reason where useful.

### Task 6.2 — relation navigation

Keep existing Jazz relation navigation rather than inventing SQL foreign-key navigation.

Acceptance:

- clicking a relation can navigate/filter the target table;
- the target table appears through the same generic explorer.

### Task 6.3 — future schema graph

WhoDB-style schema graph can be a later milestone.

Proposed route:

```text
/schema-graph
```

Data source:

```ts
for (const [tableName, table] of Object.entries(wasmSchema)) {
  for (const column of table.columns) {
    if (column.references) {
      // emit edge tableName -> referenced table
    }
  }
}
```

Do not make schema graph a blocker for CRUD MVP.

---

## Phase 7 — agent/provenance visibility

This is a Jazz-specific product advantage and should become a first-class admin feature.

### Task 7.1 — expose provenance columns

The current grid already defines:

```text
$createdAt
$createdBy
$updatedAt
$updatedBy
```

Defaults:

- show `$createdAt` and `$updatedAt`;
- allow `$createdBy` and `$updatedBy` in column customization;
- later add an `Agent activity` preset that shows all four.

### Task 7.2 — agent filter

Future filter example:

```json
{
  "$updatedBy": {
    "contains": "mcp:"
  }
}
```

### Task 7.3 — activity view

Later route:

```text
/activity
```

Initial implementation can be a cross-table view derived from recent rows/provenance only if Jazz exposes an efficient supported query. Do not fake a global changelog by polling every table.

When a stable row-history API is available for the runtime, add:

- row history drawer;
- before/after values;
- writer identity;
- schema branch/version;
- restore/cherry-pick only after semantics are well specified.

---

## Phase 8 — connection and environment management

The current standalone Inspector already supports saved named connections.

### Task 8.1 — preserve connection manager

Each connection keeps:

```ts
{
  name,
  serverUrl,
  appId,
  adminSecret,
  env,
  branch,
  schemaHash
}
```

### Task 8.2 — improve environment clarity

Show in the shell:

```text
Local dev · app-id · dev/main
```

Add visual warning for obvious production environments later.

### Task 8.3 — schema switching

Keep schema-hash selector in the top bar.

When switching:

1. shut down old runtime;
2. fetch selected schema;
3. create new client/runtime;
4. rebuild generic table/query UI;
5. preserve connection settings.

---

# 9. Security plan

## 9.1 Development MVP

Standalone Inspector currently accepts an admin secret. This is acceptable for a local developer/admin utility when the operator deliberately provides privileged credentials.

Rules:

- never render the secret after input;
- never include it in logs;
- do not put it in screenshots/docs;
- do not send analytics containing it;
- warn that the admin connection is privileged.

## 9.2 Production admin product

Do **not** ship a public web app that permanently stores a server admin secret in browser localStorage.

Production target:

```text
browser admin UI
      |
      | normal authenticated admin session
      v
admin BFF / trusted backend
      |
      | Jazz backend/admin credential
      v
Jazz server
```

Or use a Jazz permission-scoped user/session model if the product does not need full backend privileges.

### Task 9.2.1

- [ ] define admin authentication provider;
- [ ] define operator roles;
- [ ] put privileged Jazz secret server-side;
- [ ] audit mutations;
- [ ] add CSRF/session protections appropriate to the chosen BFF stack.

This is a post-MVP hardening milestone unless the admin UI will be internet-exposed immediately.

---

# 10. MCP + Admin UI combined demo

This repository contains both the MCP connector and the Inspector fork. Use that intentionally.

## Demo topology

```text
Terminal A: jazz-tools@alpha server
Terminal B: Jazz Admin Inspector
Terminal C: MCP Inspector / Claude / Codex using jazz-tools-mcp-v2
```

### Terminal A — Jazz server

```bash
export JAZZ_APP_ID="<dev-app-id>"
export JAZZ_ADMIN_SECRET="<dev-admin-secret>"

npx --yes jazz-tools@alpha server "$JAZZ_APP_ID" \
  --port 1625 \
  --data-dir ./data \
  --admin-secret "$JAZZ_ADMIN_SECRET"
```

### Terminal B — admin UI

```bash
nix develop
cd packages/inspector
pnpm install --frozen-lockfile
pnpm dev
```

Open:

```text
http://localhost:5173
```

Connect with:

```text
serverUrl: http://127.0.0.1:1625
appId:     <dev-app-id>
adminSecret: <dev-admin-secret>
```

### Terminal C — MCP connector

From repository root:

```bash
nix develop
npm install --no-audit --no-fund
npm run build

export JAZZ_SERVER_URL="http://127.0.0.1:1625"
export JAZZ_APP_ID="<dev-app-id>"
export JAZZ_ADMIN_SECRET="<dev-admin-secret>"
export JAZZ_MCP_ALLOW_WRITES="true"

npx --yes @modelcontextprotocol/inspector node ./dist/index.js
```

Then perform `jazz_insert`, `jazz_update`, and `jazz_delete` while the corresponding table is visible in the browser.

Acceptance: no page refresh is required to observe MCP-created changes.

---

# 11. Testing plan

## 11.1 Existing MCP tests

From root:

```bash
nix develop
npm install --no-audit --no-fund
npm run check
npm test
npm run build
```

The root integration suite proves real Jazz server/NAPI CRUD.

## 11.2 Inspector unit tests

```bash
nix develop
cd packages/inspector
pnpm install --frozen-lockfile
pnpm test
```

Required unit coverage:

- [x] standalone connection controls;
- [x] schema selector;
- [x] resizable table sidebar;
- [x] table search after this UI pass;
- [ ] active table breadcrumb;
- [ ] realtime status in standalone mode;
- [x] grid mutation parsing (existing tests);
- [x] filter builder (existing tests).

## 11.3 Inspector build

```bash
cd packages/inspector
pnpm build
```

This must build both standalone and embedded outputs.

## 11.4 Browser E2E

Existing Inspector Playwright tests should remain the base acceptance suite.

```bash
cd packages/inspector
pnpm exec playwright install chromium
pnpm test:browser
```

Add E2E cases in order:

1. connect to seeded test server;
2. table search selects `todos`;
3. insert row;
4. save queued change;
5. edit boolean/text;
6. filter row;
7. delete row;
8. navigate schema;
9. external write appears reactively.

### Proposed realtime E2E pseudocode

```ts
test("shows a row created by a second Jazz client", async ({ page }) => {
  await page.goto(inspectorUrl);
  await openTable(page, "todos");

  const secondClient = await createTestClient();
  await secondClient.insert(app.todos, {
    title: "external realtime write",
    done: false,
  }).wait({ tier: "edge" });

  await expect(page.getByText("external realtime write")).toBeVisible();
});
```

---

# 12. Nix / macOS developer environment

The repository flake should provide at least:

```text
nodejs_22
pnpm
git
curl
cacert
```

Recommended Mac workflow:

```bash
git checkout feat/mvp-alpha-server-connector
nix develop

node --version
npm --version
pnpm --version
```

MCP tests:

```bash
npm install --no-audit --no-fund
npm test
```

Inspector tests:

```bash
cd packages/inspector
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

Inspector dev server:

```bash
pnpm dev
```

---

# 13. Implementation milestones

## Milestone A — usable admin browser

Target: current PR / next small PR.

- [x] Jazz Inspector fork imported;
- [x] standalone connection manager;
- [x] runtime schema selection;
- [x] generic tables;
- [x] reactive data grid;
- [x] CRUD;
- [x] filter/sort/page;
- [x] schema view;
- [x] WhoDB-inspired shell first pass;
- [x] searchable table navigation first pass;
- [ ] Inspector CI job in repository CI;
- [ ] run browser E2E on fork.

Definition of done:

> An operator can connect to a dev Jazz database, find any table, watch changes arrive live, stage and save inserts/edits/deletes, and inspect the table schema.

## Milestone B — agent-aware database admin

- [ ] provenance preset;
- [ ] `$createdBy/$updatedBy` filters surfaced in UX;
- [ ] MCP-to-UI realtime E2E;
- [ ] copy row ID action;
- [ ] row detail drawer;
- [ ] safer delete confirmation;
- [ ] connection/environment badge.

Definition of done:

> You can watch an MCP agent modify Jazz in real time and identify which rows the agent created or updated.

## Milestone C — production hardening

- [ ] BFF/server-side privileged credential;
- [ ] real admin auth;
- [ ] audit logging;
- [ ] production environment warnings;
- [ ] stable Jazz alpha version pin + lock/update process;
- [ ] deployment target;
- [ ] accessibility pass;
- [ ] Playwright full CRUD/realtime suite.

## Milestone D — advanced Jazz-native admin features

Only after supported runtime APIs are stable:

- [ ] row history/diff viewer;
- [ ] branch viewer;
- [ ] relation/schema graph;
- [ ] permission policy viewer;
- [ ] schema/migration read-only history;
- [ ] controlled schema operations via a trusted backend;
- [ ] agent activity timeline.

---

# 14. File-by-file plan

## `packages/inspector/src/components/inspector-layout/index.tsx`

Purpose: product shell.

Changes:

- Jazz Admin brand;
- route breadcrumb;
- standalone live connection badge;
- keep schema and connections controls;
- preserve overlay close action.

## `packages/inspector/src/components/inspector-layout/index.module.css`

Purpose: compact WhoDB-style database shell.

Changes:

- 48px admin header;
- brand icon/text;
- breadcrumb styles;
- connection/live pill;
- responsive hiding for low-priority metadata.

## `packages/inspector/src/pages/data-explorer/index.tsx`

Purpose: database object browser.

Changes:

- searchable tables;
- table icons;
- column counts;
- schema shortcut;
- live footer.

## `packages/inspector/src/pages/data-explorer/index.module.css`

Purpose: dense sidebar and selected-object styling.

Changes:

- search box;
- object rows;
- selected data/schema states;
- metadata count;
- status footer.

## `packages/inspector/src/components/data-explorer/TableDataGrid.tsx`

MVP rule: preserve behavior unless a targeted UX change is necessary.

Current valuable functionality to keep:

- live query;
- row/cell update animation;
- staged insert;
- queued edits;
- queued deletes;
- save/discard rail;
- schema/customize controls;
- relation cells.

## `packages/inspector/src/App.tsx`

Keep the existing runtime/connection flow in MVP.

Later production hardening may replace direct browser admin-secret persistence with a BFF/session flow.

---

# 15. Acceptance checklist for the first usable build

Connection:

- [ ] app opens with no runtime crash;
- [ ] existing named connection works;
- [ ] new connection can be added;
- [ ] schema list loads;
- [ ] schema can be switched.

Navigation:

- [ ] all runtime tables appear;
- [ ] search filters table list instantly;
- [ ] table count is correct;
- [ ] column counts are correct;
- [ ] data and schema routes work.

Realtime:

- [ ] open table updates when another Jazz client inserts;
- [ ] update is visible without reload;
- [ ] delete is visible without reload;
- [ ] visual change animation does not interfere with editing.

CRUD:

- [ ] insert can be staged;
- [ ] insert can be discarded;
- [ ] insert can be saved;
- [ ] cells can be edited;
- [ ] edit can be discarded;
- [ ] edit can be saved;
- [ ] rows can be selected/deleted;
- [ ] invalid typed values produce understandable errors.

Jazz-specific:

- [ ] `$createdAt` visible;
- [ ] `$updatedAt` visible;
- [ ] `$createdBy` can be enabled;
- [ ] `$updatedBy` can be enabled;
- [ ] relation navigation works;
- [ ] schema version remains explicit.

Developer experience:

- [ ] `nix develop` provides Node + pnpm;
- [ ] root tests pass;
- [ ] Inspector unit tests pass;
- [ ] Inspector build passes;
- [ ] local manual runbook works on macOS.

---

# 16. Design rules for future changes

1. **Jazz-native before generic DB conventions.** If a feature conflicts with local-first/sync semantics, follow Jazz.
2. **Never bypass runtime schema.** The admin panel must work for unknown application tables.
3. **Realtime by subscription, not polling.** Use Jazz reactive queries.
4. **Stage destructive mutations.** Database-admin tooling should make pending changes visible.
5. **Provenance is product UI, not hidden metadata.** Agent-heavy databases need writer identity.
6. **Do not expose privileged secrets casually.** Local dev and production threat models are different.
7. **Keep upstream Inspector logic easy to diff.** Product shell changes should be localized.
8. **WhoDB informs UX, not architecture.** Reuse interaction ideas; do not transplant its SQL/GraphQL backend into Jazz.
9. **Test with two writers.** A Jazz admin panel is incomplete if only single-client CRUD is tested.
10. **Pin before release.** Alpha dependencies may move; a release should use a verified Jazz/Jazz-NAPI version pair and lockfile strategy.

---

# 17. Immediate next tasks after this first UI pass

Priority order:

1. [ ] add Inspector-specific CI job (`pnpm install --frozen-lockfile`, unit tests, build);
2. [ ] run/fix all Inspector unit tests after shell changes;
3. [ ] run/fix Playwright standalone Inspector suite;
4. [ ] add MCP -> UI realtime browser test;
5. [ ] add explicit connection/environment summary to standalone context (name + env + branch) so the header can show `Local dev · dev/main`;
6. [ ] add safe multi-row delete confirmation;
7. [ ] add an `Agent activity` column preset;
8. [ ] add copy-row-ID and copy-cell actions;
9. [ ] decide BFF/auth architecture before internet deployment;
10. [ ] pin Jazz alpha versions for a tagged release.

This sequence deliberately makes the current generic Jazz Inspector a useful admin application first, before adding schema mutation, migrations, policy editing, history, or AI-specific features.
