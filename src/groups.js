import { randomInt } from "node:crypto";

export class DrawError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function names(value, count, label) {
  if (!Array.isArray(value) || value.length !== count) {
    throw new DrawError(`Enter exactly ${count} ${label}.`);
  }
  const clean = value.map((name) => {
    if (typeof name !== "string" || !name.trim() || name.trim().length > 80) {
      throw new DrawError(`Each ${label} name must contain 1–80 characters.`);
    }
    return name.trim().normalize("NFC");
  });
  if (new Set(clean.map((name) => name.toLowerCase())).size !== count) {
    throw new DrawError(`The ${label} names must be unique.`);
  }
  return clean;
}

export function validateDraw(input) {
  if (!input || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new DrawError("Reload the current draw before generating another.");
  }
  return {
    players: names(input.players, 3, "player"),
    teams: names(input.teams, 30, "team"),
    expectedVersion: input.expectedVersion,
  };
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function generateGroups(players, teams) {
  const shuffledTeams = shuffle(teams);
  return Array.from({ length: 10 }, (_, index) => ({
    name: String.fromCharCode(65 + index),
    entries: shuffle(players).map((player, slot) => ({
      player,
      team: shuffledTeams[index * 3 + slot],
    })),
  }));
}

export function fixturesForDraw(draw) {
  if (!draw?.groups) return [];
  return draw.groups.flatMap((group, groupIndex) => {
    const [first, second, third] = group.entries;
    return [
      { key: `group-${group.name}-1`, stage: "group", group: group.name, round: groupIndex * 3 + 1, home: first, away: second },
      { key: `group-${group.name}-2`, stage: "group", group: group.name, round: groupIndex * 3 + 2, home: second, away: third },
      { key: `group-${group.name}-3`, stage: "group", group: group.name, round: groupIndex * 3 + 3, home: third, away: first },
    ];
  });
}

export const groupsSchema = `
  CREATE TABLE IF NOT EXISTS tournament_draws (
    version INTEGER PRIMARY KEY CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload JSONB NOT NULL
  );
`;

function snapshot(row) {
  return row ? { version: row.version, createdAt: row.created_at, ...row.payload } : null;
}

export async function getLatestDraw(pool) {
  const result = await pool.query("SELECT * FROM tournament_draws ORDER BY version DESC LIMIT 1");
  return snapshot(result.rows[0]);
}

export async function saveDraw(pool, input) {
  const { players, teams, expectedVersion } = validateDraw(input);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize redraws, including the first draw when there is no row to lock.
    await client.query("SELECT pg_advisory_xact_lock(726301)");
    const latest = await getLatestDraw(client);
    if ((latest?.version ?? 0) !== expectedVersion) {
      throw new DrawError("Someone generated a newer draw. Reload it before drawing again.", 409);
    }
    const payload = { players, teams, groups: generateGroups(players, teams) };
    const result = await client.query(
      "INSERT INTO tournament_draws (version, payload) VALUES ($1, $2) RETURNING *",
      [expectedVersion + 1, JSON.stringify(payload)],
    );
    await client.query("COMMIT");
    return snapshot(result.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
