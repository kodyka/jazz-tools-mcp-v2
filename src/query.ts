import type {
  DynamicTableRow,
  QueryBuilder,
  TableProxy,
  WasmSchema,
} from "jazz-tools";

export type GenericWhereInput = Record<string, unknown>;

export interface OrderByInput {
  column: string;
  direction?: "asc" | "desc";
}

/**
 * Dynamic QueryBuilder adapted from the official Jazz Inspector's
 * `GenericQueryBuilder`. It intentionally uses Jazz's normal query JSON shape
 * instead of translating MCP requests into SQL.
 */
export class GenericQueryBuilder implements QueryBuilder<DynamicTableRow> {
  readonly _table: string;
  readonly _schema: WasmSchema;
  readonly _rowType: DynamicTableRow = undefined as unknown as DynamicTableRow;

  private conditions: Array<{ column: string; op: string; value: unknown }> = [];
  private selectColumns: string[] = [];
  private orderBys: Array<[string, "asc" | "desc"]> = [];
  private limitValue: number | undefined;
  private offsetValue: number | undefined;

  constructor(tableName: string, schema: WasmSchema) {
    this._table = tableName;
    this._schema = schema;
  }

  where(input: GenericWhereInput): GenericQueryBuilder {
    const clone = this.clone();
    for (const [column, value] of Object.entries(input)) {
      if (value === undefined) continue;
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.getPrototypeOf(value) === Object.prototype
      ) {
        for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
          if (opValue !== undefined) clone.conditions.push({ column, op, value: opValue });
        }
      } else {
        clone.conditions.push({ column, op: "eq", value });
      }
    }
    return clone;
  }

  select(columns: string[]): GenericQueryBuilder {
    const clone = this.clone();
    clone.selectColumns = [...columns];
    return clone;
  }

  orderBy(items: OrderByInput[]): GenericQueryBuilder {
    const clone = this.clone();
    clone.orderBys = items.map(({ column, direction }) => [column, direction ?? "asc"]);
    return clone;
  }

  limit(value: number): GenericQueryBuilder {
    const clone = this.clone();
    clone.limitValue = value;
    return clone;
  }

  offset(value: number): GenericQueryBuilder {
    const clone = this.clone();
    clone.offsetValue = value;
    return clone;
  }

  _build(): string {
    return JSON.stringify({
      table: this._table,
      conditions: this.conditions,
      includes: {},
      select: this.selectColumns,
      orderBy: this.orderBys,
      limit: this.limitValue,
      offset: this.offsetValue,
      hops: [],
    });
  }

  private clone(): GenericQueryBuilder {
    const clone = new GenericQueryBuilder(this._table, this._schema);
    clone.conditions = [...this.conditions];
    clone.selectColumns = [...this.selectColumns];
    clone.orderBys = [...this.orderBys];
    clone.limitValue = this.limitValue;
    clone.offsetValue = this.offsetValue;
    return clone;
  }
}

export function dynamicTableProxy(
  tableName: string,
  schema: WasmSchema,
): TableProxy<DynamicTableRow, Record<string, unknown>> {
  return {
    _table: tableName,
    _schema: schema,
    _rowType: undefined as unknown as DynamicTableRow,
    _initType: undefined as unknown as Record<string, unknown>,
  };
}

export function assertTable(schema: WasmSchema, tableName: string): void {
  if (!schema[tableName]) {
    throw new Error(`Unknown Jazz table: ${tableName}`);
  }
}

export function assertColumns(schema: WasmSchema, tableName: string, columns: string[]): void {
  assertTable(schema, tableName);
  const allowed = new Set(["id", ...schema[tableName]!.columns.map((column) => column.name)]);
  const unknown = columns.filter((column) => !allowed.has(column));
  if (unknown.length > 0) {
    throw new Error(`Unknown column(s) on ${tableName}: ${unknown.join(", ")}`);
  }
}

export function assertWhereColumns(
  schema: WasmSchema,
  tableName: string,
  where: GenericWhereInput | undefined,
): void {
  if (!where) return;
  assertColumns(schema, tableName, Object.keys(where));
}
