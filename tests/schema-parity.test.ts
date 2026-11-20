import { getTableName, is, type Column, type Table } from "drizzle-orm";
import { getTableConfig as getPgTableConfig, PgTable } from "drizzle-orm/pg-core";
import { getTableConfig as getSqliteTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import * as pg from "@/lib/db/schemas/pg";
import * as sqlite from "@/lib/db/schemas/sqlite";

type TableShape = { columns: Column[]; fks: string[]; indexes: string[] };

type AnyTableConfig = {
  name: string;
  columns: Column[];
  foreignKeys: { reference(): { columns: Column[]; foreignTable: Table }; onDelete?: string }[];
  indexes: { config: { name?: string } }[];
};

function tables(mod: Record<string, unknown>, config: (t: never) => AnyTableConfig) {
  const out = new Map<string, TableShape>();
  for (const value of Object.values(mod)) {
    if (!is(value, SQLiteTable) && !is(value, PgTable)) continue;
    const c = config(value as never);
    out.set(c.name, {
      columns: c.columns,
      fks: c.foreignKeys
        .map((fk) => {
          const r = fk.reference();
          const onDelete = fk.onDelete ?? "no action";
          return `${r.columns.map((col) => col.name).join(",")}->${getTableName(r.foreignTable)} on delete ${onDelete}`;
        })
        .sort(),
      indexes: c.indexes.map((i) => String(i.config.name)).sort(),
    });
  }
  return out;
}

const sqliteTables = tables(sqlite, getSqliteTableConfig);
const pgTables = tables(pg, getPgTableConfig);

function columnShape(c: Column) {
  const generated = Boolean((c as { autoIncrement?: boolean }).autoIncrement) || c.generatedIdentity !== undefined;
  return {
    name: c.name,
    dataType: c.dataType,
    notNull: c.notNull,
    primary: c.primary,
    isUnique: c.isUnique,
    enumValues: c.enumValues,
    hasDefaultOrGenerated: c.hasDefault || generated,
  };
}

const byName = <T extends { name: string }>(xs: T[]) => [...xs].sort((a, b) => a.name.localeCompare(b.name));

describe("schema parity (SQLite vs Postgres)", () => {
  it("both schemas define the same tables", () => {
    expect(sqliteTables.size).toBeGreaterThan(0);
    expect([...pgTables.keys()].sort()).toEqual([...sqliteTables.keys()].sort());
  });

  it("every column matches across dialects", () => {
    for (const [name, s] of sqliteTables) {
      const p = pgTables.get(name);
      expect(p, `pg table ${name}`).toBeDefined();
      expect({ table: name, columns: byName(p!.columns.map(columnShape)) }).toEqual({
        table: name,
        columns: byName(s.columns.map(columnShape)),
      });
    }
  });

  it("foreign keys and indexes match", () => {
    for (const [name, s] of sqliteTables) {
      const p = pgTables.get(name);
      expect(p, `pg table ${name}`).toBeDefined();
      expect({ table: name, fks: p!.fks, indexes: p!.indexes }).toEqual({
        table: name,
        fks: s.fks,
        indexes: s.indexes,
      });
    }
  });
});
