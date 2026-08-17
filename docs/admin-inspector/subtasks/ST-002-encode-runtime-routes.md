# ST-002 — Encode all runtime table routes

Parent: Task 00
Priority: P1
Status: open follow-up

## Problem

Runtime table names can contain characters with URL meaning. Sidebar and relation paths already encode table segments, but the grid toolbar Schema link still interpolates the decoded runtime table name directly.

## Required change

```diff
- to={`/data-explorer/${table}/schema`}
+ to={`/data-explorer/${encodeURIComponent(table)}/schema`}
```

## Regression case

Use a runtime table name containing slash, space, and hash:

```text
todos/archived #1
```

Expected href:

```text
/data-explorer/todos%2Farchived%20%231/schema
```

## Checklist

- [ ] patch toolbar Schema link;
- [ ] search every `data-explorer/${...}` producer;
- [ ] keep route params decoded only at route boundary;
- [ ] use `URLSearchParams` for filter values/IDs;
- [ ] add unit regression test;
- [ ] add browser regression if dynamic test schema can expose such a table safely.

## Acceptance

No runtime table string can accidentally create a new path segment, fragment, or query string.
