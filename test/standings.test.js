import assert from 'node:assert/strict';
import test from 'node:test';
import { fixturesForDraw } from '../src/groups.js';
import { goldenBootFromMatches, groupStandingsFromMatches, leaderboardFromMatches } from '../src/matches.js';

test('group standings track results and rank teams by points, goal difference and goals scored', () => {
  const draw = { groups: [{ name: 'A', entries: [
    { team: 'Alpha', player: 'Joel' },
    { team: 'Bravo', player: 'Balázs' },
    { team: 'Charlie', player: 'Mark' },
  ] }] };
  const fixtures = fixturesForDraw(draw);
  fixtures[0].result = { homeScore: 2, awayScore: 0 };
  fixtures[1].result = { homeScore: 1, awayScore: 1 };

  const [group] = groupStandingsFromMatches(draw, fixtures);
  assert.deepEqual(group.table.map(({ team, points }) => [team, points]), [['Alpha', 3], ['Charlie', 1], ['Bravo', 1]]);
  assert.deepEqual(group.table[0], {
    team: 'Alpha', player: 'Joel', played: 1, wins: 1, draws: 0, losses: 0,
    goalsFor: 2, goalsAgainst: 0, goalDifference: 2, points: 3,
  });
  assert.equal(group.table[1].goalDifference, 0);
  assert.equal(group.table[2].goalDifference, -2);
});

test('group standings begin at zero and ignore unfinished matches', () => {
  const draw = { groups: [{ name: 'A', entries: [
    { team: 'Alpha', player: 'A' }, { team: 'Bravo', player: 'B' }, { team: 'Charlie', player: 'C' },
  ] }] };
  const fixtures = fixturesForDraw(draw);
  fixtures[0].result = { homeScore: null, awayScore: null };
  const [group] = groupStandingsFromMatches(draw, fixtures);
  assert.equal(group.table.length, 3);
  assert.ok(group.table.every(entry => entry.played === 0 && entry.points === 0));
});

test('golden boot combines goal scorers across stages with their club and gamer', () => {
  const fixtures = [
    { home: { team: 'Alpha', player: 'Joel' }, away: { team: 'Bravo', player: 'Mark' }, result: { scorers: [{ side: 'home', player: 'Forward One' }, { side: 'away', player: 'Forward Two' }] } },
    { home: { team: 'Alpha', player: 'Joel' }, away: { team: 'Charlie', player: 'Balázs' }, result: { scorers: [{ side: 'home', player: 'Forward One' }] } },
    { home: { team: 'Bravo', player: 'Mark' }, away: { team: 'Alpha', player: 'Joel' }, result: { scorers: [{ side: 'away', player: 'Forward One' }] } },
  ];
  assert.deepEqual(goldenBootFromMatches(fixtures), [
    { player: 'Forward One', team: 'Alpha', gamer: 'Joel', goals: 3 },
    { player: 'Forward Two', team: 'Bravo', gamer: 'Mark', goals: 1 },
  ]);
});

test('gamer leaderboard includes knockout points and always crowns the champion', () => {
  const draw = { players: ['Joel', 'Balázs', 'Mark'] };
  const fixtures = [
    { home: { team: 'Alpha', player: 'Joel' }, away: { team: 'Bravo', player: 'Mark' }, result: { homeScore: 4, awayScore: 0 } },
    { home: { team: 'Charlie', player: 'Mark' }, away: { team: 'Alpha', player: 'Joel' }, result: { homeScore: 1, awayScore: 1, winnerTeam: 'Charlie' } },
  ];
  const leaderboard = leaderboardFromMatches(draw, fixtures, 'Mark');
  assert.equal(leaderboard[0].player, 'Mark');
  assert.equal(leaderboard[0].champion, true);
  assert.equal(leaderboard[0].points, 3);
  assert.equal(leaderboard[0].wins, 1);
  assert.equal(leaderboard.find(entry => entry.player === 'Joel').points, 3);
});
