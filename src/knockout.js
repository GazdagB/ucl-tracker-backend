import { DrawError } from './groups.js';
import { getMatches, groupStandingsFromMatches } from './matches.js';
import { getSquad } from './squads.js';

export const knockoutSchema = `
  CREATE TABLE IF NOT EXISTS knockout_results (
    draw_version INTEGER NOT NULL REFERENCES tournament_draws(version) ON DELETE CASCADE,
    fixture_key TEXT NOT NULL CHECK (fixture_key ~ '^knockout-(r16|qf|sf|final)-[1-8]$'),
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_score INTEGER NOT NULL CHECK (home_score >= 0 AND home_score <= 99),
    away_score INTEGER NOT NULL CHECK (away_score >= 0 AND away_score <= 99),
    winner_team TEXT NOT NULL,
    scorers JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (draw_version, fixture_key)
  );
  ALTER TABLE knockout_results ADD COLUMN IF NOT EXISTS scorers JSONB NOT NULL DEFAULT '[]'::jsonb;
`;

const roundDefinitions = [
  { code: 'r16', name: 'Round of 16', count: 8 },
  { code: 'qf', name: 'Quarter-finals', count: 4 },
  { code: 'sf', name: 'Semi-finals', count: 2 },
  { code: 'final', name: 'Final', count: 1 },
];

function rankTeams(a, b) {
  return b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor || b.wins - a.wins || a.team.localeCompare(b.team);
}

export function qualifiersFromStandings(groupStandings) {
  const winners = groupStandings.map(group => ({ ...group.table[0], group: group.name, groupPosition: 1 })).sort(rankTeams);
  const runnersUp = groupStandings.map(group => ({ ...group.table[1], group: group.name, groupPosition: 2 })).sort(rankTeams).slice(0, 6);
  return [...winners, ...runnersUp].map((team, index) => ({ ...team, seed: index + 1 }));
}

function openingPairs(qualifiers) {
  const highSeeds = qualifiers.slice(0, 8);
  const lowSeeds = qualifiers.slice(8).reverse();
  return highSeeds.map(high => {
    let opponentIndex = lowSeeds.findIndex(low => low.group !== high.group);
    if (opponentIndex < 0) opponentIndex = 0;
    return [high, lowSeeds.splice(opponentIndex, 1)[0]];
  });
}

function savedForFixture(savedByKey, key, home, away) {
  const result = savedByKey.get(key);
  return result && home && away && result.homeTeam === home.team && result.awayTeam === away.team ? result : null;
}

function makeRound(definition, pairs, savedByKey) {
  return {
    ...definition,
    fixtures: Array.from({ length: definition.count }, (_, index) => {
      const [home = null, away = null] = pairs[index] || [];
      const key = `knockout-${definition.code}-${index + 1}`;
      return { key, home, away, result: savedForFixture(savedByKey, key, home, away), locked: !home || !away };
    }),
  };
}

function fixtureWinner(fixture) {
  if (!fixture.result) return null;
  return fixture.result.winnerTeam === fixture.home?.team ? fixture.home : fixture.result.winnerTeam === fixture.away?.team ? fixture.away : null;
}

export function buildKnockoutBracket(qualifiers, savedResults = []) {
  const savedByKey = new Map(savedResults.map(result => [result.fixtureKey, result]));
  const rounds = [];
  const roundOf16 = makeRound(roundDefinitions[0], openingPairs([...qualifiers]), savedByKey);
  rounds.push(roundOf16);
  let previous = roundOf16;
  for (const definition of roundDefinitions.slice(1)) {
    const winners = previous.fixtures.map(fixtureWinner);
    const pairs = Array.from({ length: definition.count }, (_, index) => [winners[index * 2], winners[index * 2 + 1]]);
    const round = makeRound(definition, pairs, savedByKey);
    rounds.push(round);
    previous = round;
  }
  const final = rounds.at(-1).fixtures[0];
  return { rounds, champion: fixtureWinner(final) };
}

function databaseResult(row) {
  return {
    fixtureKey: row.fixture_key,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeScore: row.home_score,
    awayScore: row.away_score,
    winnerTeam: row.winner_team,
    scorers: (row.scorers || []).map(({ side, player }) => ({ side, player })),
    updatedAt: row.updated_at,
  };
}

async function storedResults(pool, drawVersion) {
  const result = await pool.query('SELECT fixture_key, home_team, away_team, home_score, away_score, winner_team, scorers, updated_at FROM knockout_results WHERE draw_version = $1', [drawVersion]);
  return result.rows.map(databaseResult);
}

export async function getKnockout(pool) {
  const matchData = await getMatches(pool);
  if (!matchData.draw) return { draw: null, groupProgress: { completed: 0, total: 0 }, qualifiers: [], rounds: [], champion: null };
  const completed = matchData.fixtures.filter(fixture => fixture.result && fixture.result.homeScore !== null && fixture.result.awayScore !== null).length;
  const groupProgress = { completed, total: matchData.fixtures.length };
  const groupsComplete = completed === matchData.fixtures.length && completed > 0;
  const standings = groupStandingsFromMatches(matchData.draw, matchData.fixtures);
  const qualifiers = groupsComplete ? qualifiersFromStandings(standings) : [];
  const saved = await storedResults(pool, matchData.draw.version);
  const bracket = groupsComplete ? buildKnockoutBracket(qualifiers, saved) : { rounds: roundDefinitions.map(definition => makeRound(definition, [], new Map())), champion: null };
  return { draw: matchData.draw, groupProgress, qualifiers, ...bracket };
}

function knockoutScore(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 99) throw new DrawError(`${label} must be a whole number from 0 to 99.`);
  return value;
}

function knockoutScorers(value, total) {
  if (!Array.isArray(value) || value.length !== total) throw new DrawError('Add one goal scorer for every knockout goal.');
  return value.map(entry => {
    const player = typeof entry?.player === 'string' ? entry.player.trim() : '';
    if (!['home', 'away'].includes(entry?.side) || !player || player.length > 80) throw new DrawError('Each knockout goal needs a valid team side and player.');
    return { side: entry.side, player };
  });
}

export async function saveKnockoutMatch(pool, input) {
  if (!input || typeof input.fixtureKey !== 'string' || !/^knockout-(r16|qf|sf|final)-[1-8]$/.test(input.fixtureKey)) throw new DrawError('Choose a valid knockout fixture.');
  const homeScore = knockoutScore(input.homeScore, 'Home score');
  const awayScore = knockoutScore(input.awayScore, 'Away score');
  const scorers = knockoutScorers(input.scorers, homeScore + awayScore);
  const data = await getKnockout(pool);
  if (data.groupProgress.completed !== data.groupProgress.total || !data.groupProgress.total) throw new DrawError('Complete the group stage before recording knockout results.', 409);
  const fixture = data.rounds.flatMap(round => round.fixtures).find(item => item.key === input.fixtureKey);
  if (!fixture?.home || !fixture?.away) throw new DrawError('Complete the previous knockout round first.', 409);
  if (input.homeTeam !== fixture.home.team || input.awayTeam !== fixture.away.team) throw new DrawError('The knockout bracket changed. Reload it before saving.', 409);
  if (![fixture.home.team, fixture.away.team].includes(input.winnerTeam)) throw new DrawError('Choose which team advances.');
  if (homeScore > awayScore && input.winnerTeam !== fixture.home.team || awayScore > homeScore && input.winnerTeam !== fixture.away.team) throw new DrawError('The team with the higher score must advance.');
  for (const side of ['home', 'away']) {
    const sideScorers = scorers.filter(scorer => scorer.side === side);
    if (sideScorers.length !== (side === 'home' ? homeScore : awayScore)) throw new DrawError(`Scorer counts must match ${fixture[side].team}'s score.`);
    if (!sideScorers.length) continue;
    const squad = await getSquad(fixture[side].team);
    if (sideScorers.some(scorer => !squad.players.some(player => player.name === scorer.player))) throw new DrawError(`Select goal scorers from ${fixture[side].team}'s squad.`);
  }
  const result = await pool.query(`INSERT INTO knockout_results (draw_version, fixture_key, home_team, away_team, home_score, away_score, winner_team, scorers) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (draw_version, fixture_key) DO UPDATE SET home_team=EXCLUDED.home_team, away_team=EXCLUDED.away_team, home_score=EXCLUDED.home_score, away_score=EXCLUDED.away_score, winner_team=EXCLUDED.winner_team, scorers=EXCLUDED.scorers, updated_at=NOW() RETURNING fixture_key, home_team, away_team, home_score, away_score, winner_team, scorers, updated_at`, [data.draw.version, fixture.key, fixture.home.team, fixture.away.team, homeScore, awayScore, input.winnerTeam, JSON.stringify(scorers)]);
  return databaseResult(result.rows[0]);
}
