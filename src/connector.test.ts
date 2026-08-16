import test from "node:test";
import assert from "node:assert/strict";
import { pickLatestSchemaHash } from "./connector.js";
import { GenericQueryBuilder, dynamicTableProxy } from "./query.js";
import type { WasmSchema } from "jazz-tools";

const schema = {
  todos: {
    columns: [
      { name: "title", column_type: { type: "Text" }, nullable: false },
      { name: "done", column_type: { type: "Boolean" }, nullable: false },
    ],
  },
} as unknown as WasmSchema;

test("pickLatestSchemaHash prefers greatest publishedAt", () => {
  assert.equal(
    pickLatestSchemaHash({
      hashes: ["a", "b"],
      schemas: [
        { hash: "b", publishedAt: 20 },
        { hash: "a", publishedAt: 10 },
      ],
    }),
    "b",
  );
});

test("pickLatestSchemaHash falls back to last hash", () => {
  assert.equal(
    pickLatestSchemaHash({
      hashes: ["a", "b"],
      schemas: [
        { hash: "a", publishedAt: null },
        { hash: "b", publishedAt: null },
      ],
    }),
    "b",
  );
});

test("GenericQueryBuilder emits Jazz query JSON, not SQL", () => {
  const query = new GenericQueryBuilder("todos", schema)
    .where({ done: false, title: { contains: "ship" } })
    .orderBy([{ column: "title", direction: "asc" }])
    .limit(10)
    .offset(5);

  const built = JSON.parse(query._build()) as Record<string, unknown>;
  assert.equal(built.table, "todos");
  assert.deepEqual(built.conditions, [
    { column: "done", op: "eq", value: false },
    { column: "title", op: "contains", value: "ship" },
  ]);
  assert.equal(built.limit, 10);
  assert.equal(built.offset, 5);
});

test("dynamicTableProxy implements Jazz mutation proxy shape", () => {
  const proxy = dynamicTableProxy("todos", schema);
  assert.equal(proxy._table, "todos");
  assert.equal(proxy._schema, schema);
});
