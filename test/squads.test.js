import test from 'node:test';
import assert from 'node:assert/strict';
import { createSquadLoader, mergeSquads, sportsPlayers, squadCacheFileName } from '../src/squads.js';

test('squad fallback excludes other teams and coaching staff', () => {
  const active = { idTeam: '1', strSport: 'Soccer', strStatus: 'Active', strPlayer: 'Scorer', strPosition: 'Forward', strCutout: 'https://www.thesportsdb.com/images/scorer.png' };
  assert.deepEqual(sportsPlayers({ player: [active, { ...active, idTeam: '2' }, { ...active, strStatus: 'Coaching' }, { ...active, strPosition: 'Manager' }] }, '1'), [{ name: 'Scorer', position: 'Forward', image: active.strCutout }]);
});

test('concurrent requests share a cached squad and keep clubs separate', async () => {
  let calls = 0;
  const squad = createSquadLoader({ key: 'test', sportsKey: '', diskCache: null, request: async url => { calls++; const id = Number(url.split('/').at(-1)); return { ok: true, json: async () => ({ id, squad: [{ name: `Player ${id}` }] }) }; } });
  const [a,b] = await Promise.all([squad('Arsenal'), squad('Arsenal')]);
  assert.deepEqual(a,b);
  await squad('Arsenal');
  assert.equal(calls, 1);
  const other = await squad('Barcelona');
  assert.notEqual(other.players[0].name, a.players[0].name);
  await assert.rejects(squad('Unknown club'));
});

test('player images only allow secure TheSportsDB URLs', () => {
  const player = { idTeam: '1', strSport: 'Soccer', strStatus: 'Active', strPlayer: 'Scorer', strPosition: 'Forward' };
  const [safe] = sportsPlayers({ player: [{ ...player, strThumb: 'https://r2.thesportsdb.com/images/player.png' }] }, '1');
  const [unsafe] = sportsPlayers({ player: [{ ...player, strThumb: 'https://example.com/player.png' }] }, '1');
  assert.equal(safe.image, 'https://r2.thesportsdb.com/images/player.png');
  assert.equal(unsafe.image, null);
});

test('full football squad is merged with available player pictures', () => {
  const football = [
    { name: 'Joey Veerman', position: 'Midfield', image: null },
    { name: 'Sergiño Dest', position: 'Defence', image: null },
    { name: 'Walter Benítez', position: 'Goalkeeper', image: null },
  ];
  const sports = [
    { name: 'Sergino Dest', position: 'Right-Back', image: 'https://r2.thesportsdb.com/images/dest.png' },
    { name: 'Luuk de Jong', position: 'Forward', image: 'https://r2.thesportsdb.com/images/de-jong.png' },
  ];
  const merged = mergeSquads(football, sports);
  assert.equal(merged.length, 4);
  assert.equal(merged.find(player => player.name === 'Sergiño Dest').image, sports[0].image);
  assert.ok(merged.some(player => player.name === 'Luuk de Jong'));
});

test('club names containing slashes remain a single safe cache filename', () => {
  const filename = squadCacheFileName('Bodø/Glimt');
  assert.equal(filename, 'Bodø／Glimt.json');
  assert.equal(filename.includes('/'), false);
  assert.equal(filename.includes('\\'), false);
});
