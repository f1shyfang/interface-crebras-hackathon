import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export type ToolArgs = Record<string, unknown>;

const DB_PATH = process.env.STORAGE_DB_PATH || join(process.cwd(), ".pearleye_storage.sqlite");

let _db: Database | null = null;

function getDb(): Database {
  if (!_db) {
    try {
      mkdirSync(dirname(DB_PATH), { recursive: true });
    } catch {
      /* ignore */
    }
    _db = new Database(DB_PATH);
    _db.run(`
      CREATE TABLE IF NOT EXISTS key_value (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
  }
  return _db;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export async function storageSet(args: ToolArgs = {}) {
  const key = asString(args.key);
  if (!key) throw new Error("key is required");
  if (args.value === undefined) throw new Error("value is required");

  const db = getDb();
  const serialized = JSON.stringify(args.value);
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO key_value (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, serialized, now],
  );

  return { ok: true, key, updated_at: now };
}

export async function storageGet(args: ToolArgs = {}) {
  const key = asString(args.key);
  if (!key) throw new Error("key is required");

  const db = getDb();
  const row = db
    .query<{ value: string; updated_at: string }, [string]>(
      "SELECT value, updated_at FROM key_value WHERE key = ?",
    )
    .get(key);

  if (!row) {
    return { found: false, key, value: null };
  }

  let parsed: unknown = row.value;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    /* fallback to raw text */
  }

  return { found: true, key, value: parsed, updated_at: row.updated_at };
}

export async function storageList(args: ToolArgs = {}) {
  const prefix = asString(args.prefix);
  const db = getDb();

  let query = "SELECT key, value, updated_at FROM key_value ORDER BY updated_at DESC";
  let params: string[] = [];

  if (prefix) {
    query = "SELECT key, value, updated_at FROM key_value WHERE key LIKE ? ORDER BY updated_at DESC";
    params = [`${prefix}%`];
  }

  const rows = db.query<{ key: string; value: string; updated_at: string }, string[]>(query).all(...params);

  const items = rows.map((r) => {
    let parsed: unknown = r.value;
    try {
      parsed = JSON.parse(r.value);
    } catch {
      /* fallback */
    }
    return { key: r.key, value: parsed, updated_at: r.updated_at };
  });

  return { count: items.length, items };
}

export async function storageDelete(args: ToolArgs = {}) {
  const key = asString(args.key);
  if (!key) throw new Error("key is required");

  const db = getDb();
  const info = db.run("DELETE FROM key_value WHERE key = ?", [key]);

  return { ok: true, key, deleted: info.changes > 0 };
}

export async function storageClear(args: ToolArgs = {}) {
  const prefix = asString(args.prefix);
  const db = getDb();

  let info;
  if (prefix) {
    info = db.run("DELETE FROM key_value WHERE key LIKE ?", [`${prefix}%`]);
  } else {
    info = db.run("DELETE FROM key_value");
  }

  return { ok: true, cleared: info.changes };
}

export const storageTools = {
  "storage.set": storageSet,
  "storage.get": storageGet,
  "storage.list": storageList,
  "storage.delete": storageDelete,
  "storage.clear": storageClear,
} as const;
