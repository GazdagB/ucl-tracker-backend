import ids from './team-provider-ids.json' with { type: 'json' };
import { DrawError } from './groups.js';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const cacheDir = new URL('../.squad-cache/', import.meta.url);
const cacheVersion = 3;

export function squadCacheFileName(team) {
  return `${team.replaceAll('/', '／').replaceAll('\\', '＼')}.json`;
}

function normalizedName(name) {
  return name.trim().normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

function playerImage(player) {
  const image = player.strCutout || player.strThumb;
  if (typeof image !== 'string') return null;
  try {
    const url = new URL(image);
    return url.protocol === 'https:' && (url.hostname === 'thesportsdb.com' || url.hostname.endsWith('.thesportsdb.com')) ? image : null;
  } catch {
    return null;
  }
}

export function sportsPlayers(data, teamId) {
  return (data.player || []).filter(p => String(p.idTeam) === String(teamId) && p.strSport === 'Soccer' && p.strStatus === 'Active' && !/coach|manager/i.test(p.strPosition || '')).map(p => ({ name: p.strPlayer, position: p.strPosition || '', image: playerImage(p) }));
}

export function mergeSquads(footballPlayers, sportsDbPlayers) {
  const sportsByName = new Map(sportsDbPlayers.map(player => [normalizedName(player.name), player]));
  const merged = new Map(footballPlayers.map(player => {
    const key = normalizedName(player.name);
    return [key, { ...player, image: sportsByName.get(key)?.image || player.image || null }];
  }));
  for (const player of sportsDbPlayers) {
    const key = normalizedName(player.name);
    if (!merged.has(key)) merged.set(key, player);
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function createSquadLoader({ request = fetch, key = process.env.FOOTBALL_DATA_API_KEY, sportsKey = process.env.THESPORTSDB_API_KEY || '123', diskCache = cacheDir } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function squad(team) {
    if (!Object.hasOwn(ids, team)) throw new DrawError('No squad is available for this team.', 404);
    if (cache.get(team)?.expires > Date.now()) return cache.get(team).data;
    if (pending.has(team)) return pending.get(team);
    const task = (async () => {
      const file = diskCache ? new URL(encodeURIComponent(squadCacheFileName(team)), diskCache) : null;
      if (file) try {
          const saved = JSON.parse(await readFile(file, 'utf8'));
          cache.set(team, saved);
          if (saved.version === cacheVersion && saved.expires > Date.now()) return saved.data;
        } catch { /* No disk cache yet. */ }
      const sources = ids[team];
      async function loadProvider(provider) {
        if (!sources[provider] || (provider === 'football-data' && !key) || (provider === 'thesportsdb' && !sportsKey)) return [];
        try {
          const url = provider === 'football-data' ? `https://api.football-data.org/v4/teams/${sources[provider]}` : `https://www.thesportsdb.com/api/v1/json/${sportsKey}/lookup_all_players.php?id=${sources[provider]}`;
          const response = await request(url, { headers: provider === 'football-data' ? { 'X-Auth-Token': key } : {}, signal: AbortSignal.timeout(8000) });
          if (!response.ok) return [];
          const body = await response.json();
          const players = provider === 'football-data' ? (String(body.id) === String(sources[provider]) ? (body.squad || []).map(p => ({ name: p.name, position: p.position || '', image: null })) : []) : sportsPlayers(body, sources[provider]);
          return [...new Map(players.filter(p => typeof p.name === 'string' && p.name.trim()).map(p => [normalizedName(p.name), p])).values()];
        } catch { return []; }
      }
      const [sportsDbPlayers, footballPlayers] = await Promise.all([loadProvider('thesportsdb'), loadProvider('football-data')]);
      const players = mergeSquads(footballPlayers, sportsDbPlayers);
      if (players.length) {
          const providers = [footballPlayers.length && 'football-data', sportsDbPlayers.length && 'thesportsdb'].filter(Boolean);
          const data = { team, players, provider: providers.join('+') };
          cache.set(team, { version: cacheVersion, data, expires: Date.now() + 86400000 });
          if (file) try { await mkdir(diskCache, { recursive: true }); await writeFile(file, JSON.stringify(cache.get(team))); } catch { /* Memory cache remains usable. */ }
          return data;
      }
      if (cache.has(team)) return cache.get(team).data;
      throw new DrawError('Squad unavailable right now. Please try again shortly.', 503);
    })();
    pending.set(team, task);
    try { return await task; } finally { pending.delete(team); }
  };
}
export const getSquad = createSquadLoader();
