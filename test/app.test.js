import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createApp } from "../src/app.js";

async function withServer(pool, check) {
  const server = createApp({ pool }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await check(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("API stays live when PostgreSQL is not configured", async () => {
  await withServer(null, async (url) => {
    const live = await fetch(`${url}/api/health`);
    assert.equal(live.status, 200);
    assert.equal((await live.json()).status, "ok");
    const ready = await fetch(`${url}/api/ready`);
    assert.equal(ready.status, 503);
    assert.equal((await ready.json()).database, "not_configured");
  });
});

test("readiness checks the database connection", async () => {
  let query;
  await withServer({ query: async (sql) => { query = sql; } }, async (url) => {
    const response = await fetch(`${url}/api/ready`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).database, "connected");
    assert.equal(query, "SELECT 1");
  });
});

test("database failures do not leak connection details", async () => {
  await withServer({ query: async () => { throw new Error("private connection details"); } }, async (url) => {
    const response = await fetch(`${url}/api/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: "not_ready", database: "unavailable" });
  });
});

test("data routes stay unavailable when the database is not configured", async () => {
  await withServer(null, async (url) => {
    const response = await fetch(`${url}/api/groups`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: 0, players: ["A", "B", "C"], teams: ["Only one club"] }),
    });
    assert.equal(response.status, 503);
    assert.equal((await fetch(`${url}/api/groups`)).status, 503);
  });
});

test("anonymous users cannot read or change tournament data", async () => {
  const pool = { query: async sql => {
    if (sql.includes('FROM sessions')) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected query: ${sql}`);
  } };
  await withServer(pool, async url => {
    assert.equal((await fetch(`${url}/api/groups`)).status, 401);
    assert.equal((await fetch(`${url}/api/matches`)).status, 401);
    assert.equal((await fetch(`${url}/api/leaderboard`)).status, 401);
    assert.equal((await fetch(`${url}/api/knockout`)).status, 401);
    assert.equal((await fetch(`${url}/api/squad?team=Arsenal`)).status, 401);
    assert.equal((await fetch(`${url}/api/groups`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    const me = await fetch(`${url}/api/auth/me`);
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), { user: null });
  });
});
