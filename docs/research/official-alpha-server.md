# Research: official `jazz-tools@alpha server`

Research date: 2026-08-16

Primary source: `garden-co/jazz`, with the user-provided reference commit:

`fa7d33b3ecfc9fcb673cd7c7bb9c35d700255e1d`

At research time the official `packages/jazz-tools/package.json` on `main` and at that commit reports:

```text
jazz-tools 2.0.0-alpha.53
```

## 1. The documented self-host command is real and current

Official example:

`examples/docs/todo-server-rs/docs/self-host-cli.sh`

```bash
export JAZZ_APP_ID="replace-with-your-app-id"
export JAZZ_ADMIN_SECRET="replace-with-admin-secret"

npx jazz-tools@alpha server "$JAZZ_APP_ID" \
  --port 1625 \
  --data-dir ./data \
  --admin-secret "$JAZZ_ADMIN_SECRET"
```

The docs page `docs/content/docs/getting-started/server-setup.mdx` documents the same command and the full current option set.

## 2. `npx jazz-tools@alpha server` runs the Rust server binary

`packages/jazz-tools/bin/jazz-tools.js` is the npm wrapper.

It handles TypeScript-side commands (`validate`, `deploy`, `migrations`, `permissions`, `schema`) in the TS CLI, and handles `mcp` in the existing documentation MCP server. Other commands, including `server`, are forwarded to the platform-specific bundled Rust `jazz-tools` binary.

This matters because a new MCP connector must model the behavior of the Rust server, not assume the npm wrapper itself contains a JavaScript database server.

## 3. Current server CLI contract

`crates/jazz-tools/src/main.rs` defines `jazz-tools server` with:

- positional app ID
- `--port`
- `--data-dir`
- `--in-memory`
- `--jwks-url`
- `--jwt-public-key`
- `--auth-cookie-name`
- `--allow-local-first-auth`
- `--backend-secret`
- `--admin-secret`
- `--upstream-url`
- `--shutdown-timeout-secs`

The current command builds a `ServerBuilder`, selects persistent or in-memory storage, binds an Axum listener, and supports controlled shutdown.

## 4. Server routes

`crates/jazz-tools/src/server/routes/mod.rs` constructs the HTTP router.

Public health:

```text
GET /health
```

App-scoped routes:

```text
/apps/<app-id>/ws
/apps/<app-id>/schema/:hash
/apps/<app-id>/schemas
/apps/<app-id>/admin/schemas
/apps/<app-id>/admin/schema-connectivity
/apps/<app-id>/admin/permissions/head
/apps/<app-id>/admin/permissions
/apps/<app-id>/admin/migrations
/apps/<app-id>/admin/introspection/subscriptions
```

There is no generic REST `/rows` or SQL endpoint. Data reads/writes flow through Jazz's sync/runtime protocol.

## 5. WebSocket auth is the key compatibility fact

`crates/jazz-tools/src/server/routes/websocket.rs` documents and implements this handshake priority:

1. valid `admin_secret` -> backend connection
2. `backend_secret` with no user JWT/session -> backend connection
3. otherwise resolve a user session

Therefore the exact self-host example containing only `--admin-secret` is sufficient for an admin-authenticated Jazz WebSocket transport.

This is why the MVP can match the command exactly.

## 6. Official TypeScript backend runtime

`packages/jazz-tools/src/backend/create-jazz-context.ts` creates a Node NAPI runtime and calls `JazzClient.connectWithRuntime(...)`.

When `serverUrl` is set it connects the Rust-owned transport with:

```ts
{
  backend_secret: config.backendSecret,
  admin_secret: config.adminSecret,
  jwt_token: config.jwtToken
}
```

The context exposes:

- `db(source?)`
- `asBackend(source?)`
- `withAttribution(principalId, source?)`
- `forRequest(...)`
- `forSession(...)`

`asBackend` and attribution/session helpers require the explicit backend-secret path for server-connected scoped access. For exact admin-only self-host compatibility, the MVP uses `context.db(rawSchema)`, whose underlying transport is already authenticated with the admin secret.

If a backend secret is configured, the MVP uses `asBackend` or `withAttribution` instead.

## 7. Raw server schema can initialize Jazz

`packages/jazz-tools/src/schema-source.ts` defines:

```ts
SchemaSourceInput = WasmSchema | WasmSchemaSource | QuerySchemaSource
```

So a raw `WasmSchema` fetched from the server can be passed to `context.db(schema)` / `context.asBackend(schema)`.

This removes the need to execute arbitrary application source code inside the MCP process.

## 8. Official schema-fetch API

`packages/jazz-tools/src/runtime/schema-fetch.ts` exposes:

- `fetchSchemaHashes(serverUrl, { appId, adminSecret })`
- `fetchStoredWasmSchema(serverUrl, { appId, adminSecret, schemaHash })`
- permissions and publish helpers

These functions use the official app-scoped routes and `X-Jazz-Admin-Secret`.

The MCP uses only the read helpers in MVP.

## 9. Generic querying already exists in the official Inspector

The official Inspector's `packages/inspector/src/utility/generic-query-builder.ts` implements the public `QueryBuilder` interface dynamically from a table name and `WasmSchema`. It builds Jazz query JSON with conditions, select, order, limit, and offset.

The MCP adapts this pattern instead of generating SQL.

## 10. Dynamic mutation is also supported by the public runtime contracts

`packages/jazz-tools/src/runtime/db.ts` defines `TableProxy<T, Init>` as a small structural interface containing `_table`, `_schema`, and phantom row/init types.

Normal mutation methods accept this proxy:

```text
Db.insert(table, data)
Db.update(table, id, data)
Db.delete(table, id)
```

The MVP builds a dynamic table proxy only after validating the table and columns against the fetched server schema.

## 11. Existing official `jazz-tools mcp` is a different product

The npm wrapper routes `jazz-tools mcp` to `packages/jazz-tools/dist/mcp/server.js`.

The current official MCP implementation is a documentation MCP. Its tools are:

- `search_docs`
- `get_doc`
- `list_pages`

It is useful as proof that Jazz ships MCP support, but it does not connect agents to app data. This repository fills that separate use case.

## MVP conclusion

The narrowest connector that matches the current alpha server is:

```text
schema catalogue GETs with admin secret
        +
createJazzContext with raw WasmSchema
        +
Jazz-native dynamic queries/mutations over /ws
        +
MCP stdio surface
```

Not:

```text
raw SQLite
REST CRUD invented by the MCP
old CoJSON 0.9 APIs
second WebSocket sync server
arbitrary SQL
```
