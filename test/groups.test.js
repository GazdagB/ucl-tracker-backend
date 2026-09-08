import assert from "node:assert/strict";
import test from "node:test";
import { fixturesForDraw, generateGroups, validateDraw } from "../src/groups.js";

const players = ["Player A", "Player B", "Player C"];
const teams = Array.from({ length: 30 }, (_, index) => `Club ${index + 1}`);

test("every draw uses 30 teams once, ten groups and ten teams per player", () => {
  for (let run = 0; run < 200; run++) {
    const groups = generateGroups(players, teams);
    assert.equal(groups.length, 10);
    assert.equal(new Set(groups.map((group) => group.name)).size, 10);
    const entries = groups.flatMap((group) => group.entries);
    assert.deepEqual(entries.map((entry) => entry.team).sort(), [...teams].sort());
    for (const group of groups) {
      assert.deepEqual(group.entries.map((entry) => entry.player).sort(), [...players].sort());
    }
    for (const player of players) assert.equal(entries.filter((entry) => entry.player === player).length, 10);
  }
  assert.equal(teams[0], "Club 1");
  assert.deepEqual(players, ["Player A", "Player B", "Player C"]);
});

test("rejects incorrect counts, duplicates, empty names and stale-version formats", () => {
  const valid = { players, teams, expectedVersion: 0 };
  for (const invalid of [
    { ...valid, teams: teams.slice(0, 29) },
    { ...valid, teams: [...teams, "Club 31"] },
    { ...valid, teams: [...teams.slice(0, 29), " CLUB 1 "] },
    { ...valid, players: ["A", "a", "B"] },
    { ...valid, players: ["A", " ", "C"] },
    { ...valid, expectedVersion: -1 },
    { ...valid, expectedVersion: "0" },
  ]) assert.throws(() => validateDraw(invalid));
  assert.equal(validateDraw({ ...valid, players: [" A ", "B", "C"] }).players[0], "A");
});

test("matchdays use one continuous unique sequence across all groups", () => {
  const draw = { groups: generateGroups(players, teams) };
  const fixtures = fixturesForDraw(draw);
  assert.deepEqual(fixtures.map(fixture => fixture.round), Array.from({ length: 30 }, (_, index) => index + 1));
  assert.equal(new Set(fixtures.map(fixture => fixture.key)).size, 30);
  assert.equal(fixtures[0].key, "group-A-1");
  assert.equal(fixtures[29].key, "group-J-3");
});
