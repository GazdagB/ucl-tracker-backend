import { readdir, readFile, writeFile } from 'node:fs/promises';

const cacheDirectory = new URL('../.squad-cache/', import.meta.url);
const outputFile = new URL('../src/squad-fallbacks.json', import.meta.url);
const frozen = {};

for (const file of await readdir(cacheDirectory)) {
  if (!file.endsWith('.json')) continue;
  const saved = JSON.parse(await readFile(new URL(encodeURIComponent(file), cacheDirectory), 'utf8'));
  const team = saved?.data?.team;
  const players = saved?.data?.players;
  if (typeof team !== 'string' || !Array.isArray(players) || !players.length) continue;
  frozen[team] = players.map(({ name, position, image }) => ({
    name,
    position: position || '',
    image: image || null,
  }));
}

const ordered = Object.fromEntries(Object.entries(frozen).sort(([left], [right]) => left.localeCompare(right)));
await writeFile(outputFile, `${JSON.stringify(ordered, null, 2)}\n`);
console.log(`Frozen ${Object.keys(ordered).length} squad fallbacks.`);
