import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlinkSync } from "node:fs";
import { join } from "node:path";

const TEST_DB = join(process.cwd(), ".test_storage.sqlite");
process.env.STORAGE_DB_PATH = TEST_DB;

// Dynamic import after setting environment variable
const { storageClear, storageDelete, storageGet, storageList, storageSet } =
  await import("./storage.ts");

describe("storage tool plugin", () => {
  beforeAll(async () => {
    await storageClear();
  });

  afterAll(() => {
    try {
      unlinkSync(TEST_DB);
    } catch {
      /* ignore */
    }
  });

  test("storage.set and storage.get", async () => {
    const res = await storageSet({ key: "user:1", value: { name: "Alice", role: "admin" } });
    expect(res.ok).toBe(true);
    expect(res.key).toBe("user:1");

    const getRes = await storageGet({ key: "user:1" });
    expect(getRes.found).toBe(true);
    expect(getRes.value).toEqual({ name: "Alice", role: "admin" });
  });

  test("storage.get returns found=false for missing key", async () => {
    const getRes = await storageGet({ key: "nonexistent" });
    expect(getRes.found).toBe(false);
    expect(getRes.value).toBeNull();
  });

  test("storage.list with and without prefix", async () => {
    await storageSet({ key: "task:1", value: "Buy groceries" });
    await storageSet({ key: "task:2", value: "Walk the dog" });
    await storageSet({ key: "setting:theme", value: "dark" });

    const all = await storageList({});
    expect(all.count).toBeGreaterThanOrEqual(3);

    const tasksOnly = await storageList({ prefix: "task:" });
    expect(tasksOnly.count).toBe(2);
    expect(tasksOnly.items.map((i) => i.key)).toContain("task:1");
    expect(tasksOnly.items.map((i) => i.key)).toContain("task:2");
  });

  test("storage.delete removes item", async () => {
    await storageSet({ key: "temp", value: 123 });
    const delRes = await storageDelete({ key: "temp" });
    expect(delRes.ok).toBe(true);
    expect(delRes.deleted).toBe(true);

    const getRes = await storageGet({ key: "temp" });
    expect(getRes.found).toBe(false);
  });

  test("storage.clear with prefix", async () => {
    await storageSet({ key: "cache:a", value: 1 });
    await storageSet({ key: "cache:b", value: 2 });
    await storageSet({ key: "keep:me", value: 3 });

    const clearRes = await storageClear({ prefix: "cache:" });
    expect(clearRes.cleared).toBe(2);

    const keepRes = await storageGet({ key: "keep:me" });
    expect(keepRes.found).toBe(true);
  });
});
