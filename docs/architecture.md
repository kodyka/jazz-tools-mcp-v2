# MVP architecture

## Goal

Expose a small, auditable MCP surface over the official `jazz-tools@alpha server` without bypassing Jazz's query, mutation, schema, auth, or sync semantics.

## Data path

```text
MCP host
  |
  | stdio / MCP
  v
jazz-tools-mcp-v2
  |
  |-- GET /health
  |
  |-- GET /apps/<app-id>/schemas
  |-- GET /apps/<app-id>/schema/<hash>
  |       X-Jazz-Admin-Secret
  |
  `-- createJazzContext(...)
          |
          | NAPI runtime (in-memory local replica)
          |
          `-- Jazz WebSocket transport
                /apps/<app-id>/ws
                admin_secret or backend_secret
                        |
                        v
                 jazz-tools@alpha server
```

## Why this is not a REST connector

The official server router exposes health, schema catalogue/admin routes, and the app WebSocket endpoint. General data CRUD is carried by the Jazz sync protocol. The MCP therefore embeds the official TypeScript backend runtime and lets Jazz construct/translate queries and mutations.

## Schema discovery

The connector fetches published server schema metadata with `fetchSchemaHashes()` and `fetchStoredWasmSchema()` from `jazz-tools`. The latter returns a raw `WasmSchema`, which current `createJazzContext` accepts as a schema source when obtaining a DB handle.

This avoids brittle filesystem scanning and avoids requiring the MCP process to compile/import a user's TypeScript schema module.

## Dynamic reads

The official Inspector already needs to query tables whose TypeScript types are unknown at Inspector compile time. Its `GenericQueryBuilder` implements the public `QueryBuilder` contract using:

- `_table`
- `_schema`
- `_build()` returning Jazz query JSON

The MVP adapts that approach for `jazz_query`.

## Dynamic writes

The public `TableProxy<T, Init>` contract only requires:

- `_table`
- `_schema`
- `_rowType` phantom type
- `_initType` phantom type

The MCP constructs a dynamic proxy for a known table in the fetched schema, then calls normal `Db.insert`, `Db.update`, and `Db.delete`. Jazz itself performs value conversion, local-first mutation handling, and durability waiting.

## Auth choice

The official Rust WebSocket authentication order is:

1. valid `admin_secret` -> backend
2. valid `backend_secret` with no user session -> backend
3. otherwise resolve a user session

For strict compatibility with the official self-host snippet, admin-secret-only mode uses `context.db(schema)`; the transport itself is admin-authenticated.

If `JAZZ_BACKEND_SECRET` is supplied, the MCP uses `context.asBackend(schema)`, or `context.withAttribution(principal, schema)` when `JAZZ_MCP_PRINCIPAL` is set.

## Safety boundary

The MVP is intentionally conservative:

- stdio only
- writes disabled unless explicitly enabled
- query limit capped at 200
- table/column names checked against the fetched Jazz schema
- no SQL
- no arbitrary URLs
- no local source-tree scanning
- no schema writes
- no permissions writes
- no migration writes

Schema and policy deployment remain the responsibility of the official Jazz CLI.

## Schema lifecycle

A `JazzContext` cannot be re-used with a different schema after initialization. `jazz_reload_schema` therefore shuts down the current context and builds a new one from the configured/newest published schema.
