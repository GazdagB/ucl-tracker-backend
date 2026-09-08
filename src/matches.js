import { DrawError, fixturesForDraw, getLatestDraw } from "./groups.js";

export const matchesSchema = `
  CREATE TABLE IF NOT EXISTS match_results (
    draw_version INTEGER NOT NULL,
    fixture_key TEXT NOT NULL,
    home_score INTEGER CHECK (home_score IS NULL OR home_score >= 0),
    away_score INTEGER CHECK (away_score IS NULL OR away_score >= 0),
    scorers JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (draw_version, fixture_key)
  );
`;

function score(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 99) throw new DrawError(`${label} must be a whole number from 0 to 99.`);
  return value;
}

function scorers(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 99) throw new DrawError("Goal scorers must be a list.");
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || !["home", "away"].includes(entry.side)) throw new DrawError("Each scorer needs a home or away side.");
    const player = typeof entry.player === "string" ? entry.player.trim() : "";
    if (!player || player.length > 80) throw new DrawError("Each scorer needs a player name.");
    return { side: entry.side, player };
  });
}

export function validateMatchUpdate(input) {
  if (!input || typeof input !== "object" || typeof input.fixtureKey !== "string" || !/^group-[A-J]-[1-3]$/.test(input.fixtureKey)) throw new DrawError("Choose a valid group fixture.");
  const homeScore = score(input.homeScore, "Home score");
  const awayScore = score(input.awayScore, "Away score");
  const goalScorers = scorers(input.scorers);
  if ((homeScore === null) !== (awayScore === null)) throw new DrawError("Enter both scores, or leave both blank.");
  if (homeScore !== null && goalScorers.length !== homeScore + awayScore) throw new DrawError("Add one goal scorer for every goal before saving the result.");
  return { fixtureKey: input.fixtureKey, homeScore, awayScore, scorers: goalScorers };
}

export async function getMatches(pool) {
  const draw = await getLatestDraw(pool);
  if (!draw) return { draw: null, fixtures: [] };
  const result = await pool.query("SELECT fixture_key, home_score, away_score, scorers, updated_at FROM match_results WHERE draw_version = $1", [draw.version]);
  const saved = new Map(result.rows.map((row) => [row.fixture_key, { ...row, scorers: (row.scorers || []).map(({ side, player }) => ({ side, player })) }]));
  return { draw, fixtures: fixturesForDraw(draw).map((fixture) => ({ ...fixture, result: saved.get(fixture.key) ? { homeScore: saved.get(fixture.key).home_score, awayScore: saved.get(fixture.key).away_score, scorers: saved.get(fixture.key).scorers, updatedAt: saved.get(fixture.key).updated_at } : null })) };
}

export async function saveMatch(pool, input) {
  const update = validateMatchUpdate(input);
  const draw = await getLatestDraw(pool);
  if (!draw) throw new DrawError("Generate the groups before recording a match.", 409);
  if (!fixturesForDraw(draw).some((fixture) => fixture.key === update.fixtureKey)) throw new DrawError("That fixture is not in the current draw.", 409);
  for (const side of ['home', 'away']) {
    const goals = update.scorers.filter(s => s.side === side);
    if (goals.length !== (update[side + 'Score'] ?? 0)) throw new DrawError('Scorer counts must match each team’s score.');
  }
  const result = await pool.query(`INSERT INTO match_results (draw_version, fixture_key, home_score, away_score, scorers) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (draw_version, fixture_key) DO UPDATE SET home_score = EXCLUDED.home_score, away_score = EXCLUDED.away_score, scorers = EXCLUDED.scorers, updated_at = NOW() RETURNING fixture_key, home_score, away_score, scorers, updated_at`, [draw.version, update.fixtureKey, update.homeScore, update.awayScore, JSON.stringify(update.scorers)]);
  return result.rows[0];
}

export function leaderboardFromMatches(draw, fixtures, championPlayer = null) {
  const stats = new Map((draw?.players || []).map((player) => [player, { player, points: 0, wins: 0, draws: 0, losses: 0, goals: 0, played: 0, champion: player === championPlayer }]));
  for (const fixture of fixtures) {
    const result = fixture.result;
    if (!result || result.homeScore === null || result.awayScore === null) continue;
    const home = stats.get(fixture.home.player);
    const away = stats.get(fixture.away.player);
    if (!home || !away) continue;
    home.played++; away.played++;
    home.goals += result.homeScore; away.goals += result.awayScore;
    if (result.homeScore > result.awayScore || result.homeScore === result.awayScore && result.winnerTeam === fixture.home.team) { home.points += 3; home.wins++; away.losses++; }
    else if (result.homeScore < result.awayScore || result.homeScore === result.awayScore && result.winnerTeam === fixture.away.team) { away.points += 3; away.wins++; home.losses++; }
    else { home.points++; away.points++; home.draws++; away.draws++; }
  }
  return [...stats.values()].sort((a, b) => Number(b.champion) - Number(a.champion) || b.points - a.points || b.goals - a.goals || b.wins - a.wins || a.player.localeCompare(b.player));
}

export function groupStandingsFromMatches(draw, fixtures) {
  return (draw?.groups || []).map((group) => {
    const table = new Map(group.entries.map(({ team, player }) => [team, {
      team, player, played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    }]));
    for (const fixture of fixtures) {
      if (fixture.group !== group.name || !fixture.result || fixture.result.homeScore === null || fixture.result.awayScore === null) continue;
      const home = table.get(fixture.home.team);
      const away = table.get(fixture.away.team);
      if (!home || !away) continue;
      home.played++; away.played++;
      home.goalsFor += fixture.result.homeScore; home.goalsAgainst += fixture.result.awayScore;
      away.goalsFor += fixture.result.awayScore; away.goalsAgainst += fixture.result.homeScore;
      if (fixture.result.homeScore > fixture.result.awayScore) {
        home.wins++; home.points += 3; away.losses++;
      } else if (fixture.result.homeScore < fixture.result.awayScore) {
        away.wins++; away.points += 3; home.losses++;
      } else {
        home.draws++; away.draws++; home.points++; away.points++;
      }
    }
    for (const entry of table.values()) entry.goalDifference = entry.goalsFor - entry.goalsAgainst;
    return {
      name: group.name,
      table: [...table.values()].sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || b.wins - a.wins || a.team.localeCompare(b.team)),
    };
  });
}

export function goldenBootFromMatches(fixtures) {
  const scorers = new Map();
  for (const fixture of fixtures) {
    if (!fixture.result?.scorers) continue;
    for (const goal of fixture.result.scorers) {
      const side = goal.side === 'home' ? fixture.home : goal.side === 'away' ? fixture.away : null;
      if (!side || typeof goal.player !== 'string' || !goal.player.trim()) continue;
      const key = `${side.team}\u0000${goal.player.trim().normalize('NFC').toLocaleLowerCase()}`;
      const entry = scorers.get(key) || { player: goal.player.trim(), team: side.team, gamer: side.player, goals: 0 };
      entry.goals++;
      scorers.set(key, entry);
    }
  }
  return [...scorers.values()].sort((a, b) => b.goals - a.goals || a.player.localeCompare(b.player) || a.team.localeCompare(b.team));
}
