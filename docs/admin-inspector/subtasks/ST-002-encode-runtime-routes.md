# ST-002 — Encode all runtime table routes

Parent: Task 00
Priority: P1
Status: open follow-up

## Problem

Runtime table names are data, not URL syntax. Table names can contain characters such as `/`, `#`, spaces, `?`, or `%`; every route producer must encode the runtime table segment before inserting it into a path.

The review found two remaining raw producers:

### 1. Data grid toolbar Schema link

```tsx
// current
<Link to={`/data-explorer/${table}/schema`} aria-label="Schema">

// required
<Link to={`/data-explorer/${encodeURIComponent(table)}/schema`} aria-label="Schema">
```

### 2. Live Query -> Data Explorer link

```ts
// current
function buildExplorerUrl(table: string, queryJson: string): string {
  const base = `/data-explorer/${table}/data`;
  // ...
}

// required
function buildExplorerUrl(table: string, queryJson: string): string {
  const base = `/data-explorer/${encodeURIComponent(table)}/data`;
  // ...
}
```

Sidebar data/schema links, relation navigation, and the stale-table redirect are already encoded.

## Preferred implementation

Centralize path construction instead of repeating interpolation:

```ts
export type TableView = "data" | "schema";

export function tableViewPath(tableName: string, view: TableView): string {
  return `/data-explorer/${encodeURIComponent(tableName)}/${view}`;
}
```

Then use:

```tsx
<Link to={tableViewPath(table, "schema")} aria-label="Schema">
```

and:

```ts
const base = tableViewPath(table, "data");
```

## Regression case

Use a runtime table name containing slash, space, and hash:

```text
todos/archived #1
```

Expected paths:

```text
/data-explorer/todos%2Farchived%20%231/data
/data-explorer/todos%2Farchived%20%231/schema
```

Filter/query values stay in `URLSearchParams`, not the path.

## Checklist

- [ ] add or reuse a centralized `tableViewPath()` helper;
- [ ] patch the grid toolbar Schema link;
- [ ] patch Live Query `buildExplorerUrl()`;
- [ ] search every `data-explorer/${...}` producer;
- [ ] keep route params decoded only at the route boundary;
- [ ] keep relation IDs/filter JSON in `URLSearchParams`;
- [ ] add unit coverage for `/`, space, `#`, `?`, and `%`;
- [ ] add a component regression for the Schema toolbar href;
- [ ] add a Live Query regression for the Data Explorer href;
- [ ] add browser coverage if the dynamic test schema can expose such a table safely.

## Acceptance

No runtime table string can accidentally create a new path segment, query string, fragment, or malformed navigation target.
