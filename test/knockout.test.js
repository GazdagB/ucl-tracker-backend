import assert from 'node:assert/strict';
import test from 'node:test';
import { buildKnockoutBracket, qualifiersFromStandings } from '../src/knockout.js';
import { liveQualifiers, liveSaved } from './live-knockout-fixture.js';

test('quarter-final ownership swap preserves all earlier results and survives saving either tie first', () => {
  const saved = [...liveSaved, ...[
    [6, 'Roma', 'Liverpool', 4, 6, 'Liverpool'],
    [2, 'Feyenoord', 'Galatasaray', 5, 4, 'Feyenoord'],
    [4, 'Slavia Praha', 'Real Madrid', 2, 7, 'Real Madrid'],
  ].map(([i,homeTeam,awayTeam,homeScore,awayScore,winnerTeam]) => ({fixtureKey:`knockout-r16-${i}`,homeTeam,awayTeam,homeScore,awayScore,winnerTeam}))];
  const bracket = buildKnockoutBracket(liveQualifiers, saved);
  const qf = bracket.rounds[1].fixtures;
  assert.deepEqual(qf.map(f => [f.home.team, f.away.team]), [
    ['Paris Saint-Germain','Feyenoord'], ['Inter','Real Madrid'],
    ['Fenerbahçe','Barcelona'], ['PSV','Liverpool'],
  ]);
  assert.ok(qf.every(f => f.home.player !== f.away.player));
  for (const result of saved) assert.deepEqual(bracket.rounds[0].fixtures.find(f => f.key === result.fixtureKey).result, result);
  for (const index of [2,3]) {
    const tie = qf[index];
    const result = {fixtureKey:tie.key,homeTeam:tie.home.team,awayTeam:tie.away.team,homeScore:1,awayScore:0,winnerTeam:tie.home.team};
    const next = buildKnockoutBracket(liveQualifiers,[...saved,result]);
    assert.deepEqual(next.rounds[1].fixtures.map(f => [f.home.team,f.away.team]), qf.map(f => [f.home.team,f.away.team]));
    assert.deepEqual(next.rounds[1].fixtures[index].result,result);
  }
  const oldResult = {fixtureKey:'knockout-qf-3',homeTeam:'Fenerbahçe',awayTeam:'Liverpool',homeScore:1,awayScore:0,winnerTeam:'Fenerbahçe'};
  assert.deepEqual(buildKnockoutBracket(liveQualifiers,[...saved,oldResult]).rounds[1].fixtures[2].result,oldResult);
});

test('repairs the two live ownership clashes without changing recorded matches', () => {
  const round = buildKnockoutBracket(liveQualifiers, liveSaved).rounds[0];
  assert.equal(round.fixtures[1].away.team, 'Galatasaray');
  assert.equal(round.fixtures[3].away.team, 'Real Madrid');
  assert.equal(round.fixtures[5].away.team, 'Liverpool');
  assert.ok(round.fixtures.every(f => f.home.player !== f.away.player));
  assert.equal(new Set(round.fixtures.flatMap(f => [f.home.team, f.away.team])).size, 16);
  for (const saved of liveSaved) assert.deepEqual(round.fixtures.find(f => f.key === saved.fixtureKey).result, saved);
  const fixture = round.fixtures[1];
  const result = { fixtureKey: fixture.key, homeTeam: fixture.home.team, awayTeam: fixture.away.team, homeScore: 1, awayScore: 0, winnerTeam: fixture.home.team };
  const afterSave = buildKnockoutBracket(liveQualifiers, [...liveSaved, result]).rounds[0];
  assert.deepEqual(afterSave.fixtures.map(f => [f.home.team,f.away.team]), round.fixtures.map(f => [f.home.team,f.away.team]));
});

function standings() {
  return Array.from({ length: 10 }, (_, index) => {
    const group = String.fromCharCode(65 + index);
    return { name: group, table: [
      { team: `${group} Winner`, player: `Gamer ${index % 3 + 1}`, points: 6, goalDifference: 2, goalsFor: 2, wins: 2 },
      { team: `${group} Runner`, player: `Gamer ${(index + 1) % 3 + 1}`, points: 10 - index, goalDifference: 1, goalsFor: 1, wins: 1 },
      { team: `${group} Third`, player: `Gamer ${(index + 2) % 3 + 1}`, points: 0, goalDifference: -3, goalsFor: 0, wins: 0 },
    ] };
  });
}

test('ten group winners and the six best runners-up qualify with unique seeds', () => {
  const qualifiers = qualifiersFromStandings(standings());
  assert.equal(qualifiers.length, 16);
  assert.deepEqual(qualifiers.map(team => team.seed), Array.from({ length: 16 }, (_, index) => index + 1));
  assert.equal(qualifiers.filter(team => team.groupPosition === 1).length, 10);
  assert.deepEqual(qualifiers.filter(team => team.groupPosition === 2).map(team => team.team), ['A Runner', 'B Runner', 'C Runner', 'D Runner', 'E Runner', 'F Runner']);
});

test('knockout winners unlock every later round and produce a gamer champion', () => {
  const qualifiers = qualifiersFromStandings(standings());
  const saved = [];
  let bracket = buildKnockoutBracket(qualifiers, saved);
  assert.ok(bracket.rounds[0].fixtures.every(fixture => !fixture.locked));
  assert.ok(bracket.rounds[1].fixtures.every(fixture => fixture.locked));

  for (let roundIndex = 0; roundIndex < bracket.rounds.length; roundIndex++) {
    const round = bracket.rounds[roundIndex];
    for (const fixture of round.fixtures) {
      assert.ok(fixture.home && fixture.away);
      saved.push({ fixtureKey: fixture.key, homeTeam: fixture.home.team, awayTeam: fixture.away.team, homeScore: 1, awayScore: 0, winnerTeam: fixture.home.team });
    }
    bracket = buildKnockoutBracket(qualifiers, saved);
  }
  assert.ok(bracket.champion);
  assert.equal(bracket.champion.team, qualifiers[0].team);
  assert.equal(bracket.champion.player, qualifiers[0].player);
  assert.equal(saved.length, 15);
});

test('saved results are ignored when their participants no longer match the bracket', () => {
  const qualifiers = qualifiersFromStandings(standings());
  const bracket = buildKnockoutBracket(qualifiers, [{ fixtureKey: 'knockout-r16-1', homeTeam: 'Old Team', awayTeam: 'Other Team', homeScore: 2, awayScore: 0, winnerTeam: 'Old Team' }]);
  assert.equal(bracket.rounds[0].fixtures[0].result, null);
});
