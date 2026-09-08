import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { getLatestDraw, groupsSchema, saveDraw } from "../src/groups.js";

test("PostgreSQL persists draws and allows only one concurrent replacement", { skip: !process.env.DATABASE_URL }, async () => {
  const schema = "draw_test_" + randomUUID().replaceAll("-", "");
  const admin = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema}` });
    await pool.query(groupsSchema);
    assert.equal(await getLatestDraw(pool), null);
    const input = {
      players: ["Test A", "Test B", "Test C"],
      teams: Array.from({ length: 30 }, (_, index) => `Test club ${index}`),
      expectedVersion: 0,
    };
    const first = await saveDraw(pool, input);
    assert.equal(first.version, 1);
    assert.deepEqual((await getLatestDraw(pool)).groups, first.groups);
    const results = await Promise.allSettled([
      saveDraw(pool, { ...input, expectedVersion: 1 }),
      saveDraw(pool, { ...input, expectedVersion: 1 }),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.find((result) => result.status === "rejected").reason.status, 409);
    assert.equal((await getLatestDraw(pool)).version, 2);
    assert.equal((await pool.query("SELECT COUNT(*) FROM tournament_draws")).rows[0].count, "2");
  } finally {
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
