# End-to-end test runbook

This runbook targets the official alpha server rather than a mock REST API.

## 1. Start the official server

```bash
export JAZZ_APP_ID="replace-with-your-app-id"
export JAZZ_ADMIN_SECRET="replace-with-admin-secret"

npx jazz-tools@alpha server "$JAZZ_APP_ID" \
  --port 1625 \
  --data-dir ./data \
  --admin-secret "$JAZZ_ADMIN_SECRET"
```

Expected server-side behavior:

- `GET http://127.0.0.1:1625/health` responds.
- app routes are namespaced under `/apps/<canonical-app-id>`.
- WebSocket data sync is at the app-scoped `/ws` route.

## 2. Ensure a schema is published

Use the same app ID from a real Jazz alpha application. In development, the official server supports structural schema auto-sync. Alternatively use the project's existing `jazz-tools@alpha deploy` flow.

Verify with the Jazz Inspector or by calling the MCP's `jazz_status` after startup.

If the catalogue is empty, the MCP returns a specific error instead of guessing a schema.

## 3. Build the MCP

```bash
npm install
npm run check
npm test
npm run build
```

## 4. Configure environment

```bash
export JAZZ_SERVER_URL=http://127.0.0.1:1625
export JAZZ_APP_ID="$JAZZ_APP_ID"
export JAZZ_ADMIN_SECRET="$JAZZ_ADMIN_SECRET"
export JAZZ_MCP_ALLOW_WRITES=false
```

## 5. Launch MCP Inspector

```bash
npx @modelcontextprotocol/inspector node ./dist/index.js
```

Suggested read-only smoke sequence:

1. `jazz_status`
2. `jazz_list_tables`
3. `jazz_describe_table` for one table
4. `jazz_query` with `{ "table": "<table>", "limit": 5 }`
5. `jazz_get_row` using a returned row ID

## 6. Mutation smoke test

Restart the MCP with:

```bash
export JAZZ_MCP_ALLOW_WRITES=true
```

Use a non-production app and a table whose required fields you understand from `jazz_describe_table`.

1. `jazz_insert`
2. `jazz_get_row`
3. `jazz_update`
4. `jazz_delete`
5. query again to confirm visible state

The connector waits for the configured durability tier (`edge` by default).

## 7. Backend-secret variant

Start the official server with an additional backend secret:

```bash
export JAZZ_BACKEND_SECRET="replace-with-backend-secret"

npx jazz-tools@alpha server "$JAZZ_APP_ID" \
  --port 1625 \
  --data-dir ./data \
  --admin-secret "$JAZZ_ADMIN_SECRET" \
  --backend-secret "$JAZZ_BACKEND_SECRET"
```

Then launch the MCP with `JAZZ_BACKEND_SECRET` set. Optionally set:

```bash
export JAZZ_MCP_PRINCIPAL=mcp:test-agent
```

That exercises the explicit backend-scoped / attributed code path.

## 8. Schema reload test

Publish a new schema version through the normal Jazz project flow, then call `jazz_reload_schema`. The reported schema hash and table descriptions should update without restarting the MCP host.
