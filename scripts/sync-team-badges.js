import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { defaultRoster } from "../src/roster.js";
import { imageExtension, matchesTeam, normalizeTeam, searchNames, teamAliases, validBadgeUrl } from "../src/badge-providers.js";

const output = path.resolve(process.argv[2] || "../frontend/public/team-badges");
await mkdir(output, { recursive: true });
const manifestFile = path.join(output, "manifest.json");
let previous = { teams: [] };
try { previous = JSON.parse(await readFile(manifestFile, "utf8")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const footballKey = process.env.FOOTBALL_DATA_API_KEY;
const sportsKey = process.env.THESPORTSDB_API_KEY || "123";
const manifest = { updatedAt: new Date().toISOString(), providers: {}, teams: [] };
let footballTeams = [];

if (footballKey) {
  try {
    const response = await fetch("https://api.football-data.org/v4/competitions/CL/teams", {
      headers: { "X-Auth-Token": footballKey }, signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    footballTeams = (await response.json()).teams || [];
    manifest.providers.footballData = "enabled";
    console.log(`football-data.org: loaded ${footballTeams.length} teams.`);
  } catch (error) {
    manifest.providers.footballData = "unavailable";
    console.log(`football-data.org unavailable (${error.message}); preserving cached crests.`);
  }
} else {
  manifest.providers.footballData = "key_required";
  console.log("football-data.org: add FOOTBALL_DATA_API_KEY to .env to enable its free API.");
}
manifest.providers.theSportsDB = "enabled";

async function download(team, candidate) {
  const url = validBadgeUrl(candidate.url, candidate.provider);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok) throw new Error(`image HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > 5_000_000) throw new Error("Image exceeds 5 MB");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 5_000_000) throw new Error("Image exceeds 5 MB");
  const extension = imageExtension(bytes);
  const filename = `${normalizeTeam(team)}-${candidate.provider}.${extension}`;
  await writeFile(path.join(output, filename), bytes);
  return { ...candidate, localPath: `/team-badges/${filename}` };
}

for (const [index, team] of defaultRoster.teams.entries()) {
  const cached = previous.teams.find((entry) => entry.name === team);
  const sources = [...(cached?.sources || [])];
  const candidates = [];
  try {
    // The free API permits 30 requests/minute. Space searches below that limit.
    if (index > 0) await pause(2200);
    const response = await fetch(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(sportsKey)}/searchteams.php?t=${encodeURIComponent(searchNames[team] || team)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const results = (await response.json()).teams || [];
    const match = results.find((entry) => entry.strSport === "Soccer" && matchesTeam(team, entry.strTeam));
    if (match?.strBadge) candidates.push({
      provider: "thesportsdb", id: match.idTeam, providerTeamName: match.strTeam, url: match.strBadge,
    });
    else console.log(`${team}: no verified TheSportsDB match. Returned: ${results.map((entry) => entry.strTeam).join(", ") || "none"}`);
  } catch (error) { console.log(`${team}: TheSportsDB unavailable (${error.message}).`); }

  const footballMatch = footballTeams.find((entry) => matchesTeam(team, entry.name) || matchesTeam(team, entry.shortName));
  if (footballMatch?.crest) candidates.push({
    provider: "football-data", id: footballMatch.id, providerTeamName: footballMatch.name, url: footballMatch.crest,
  });
  for (const candidate of candidates) {
    try {
      const downloaded = await download(team, candidate);
      const existing = sources.findIndex((source) => source.provider === candidate.provider);
      if (existing < 0) sources.push(downloaded);
      else sources[existing] = downloaded;
    } catch (error) { console.log(`${team}: ${candidate.provider} badge unavailable (${error.message}).`); }
  }
  sources.sort((a, b) => (a.provider === "thesportsdb" ? 0 : 1) - (b.provider === "thesportsdb" ? 0 : 1));
  manifest.teams.push({ name: team, aliases: teamAliases[team] || [], sources });
  console.log(`[${index + 1}/30] ${team}: ${sources.length ? sources.map((source) => source.provider).join(" + ") : "initials fallback"}`);
}
// Replace the catalogue only after the complete run, so readers never see partial JSON.
await writeFile(manifestFile + ".tmp", JSON.stringify(manifest, null, 2) + "\n");
await rename(manifestFile + ".tmp", manifestFile);
console.log(`Saved ${manifest.teams.filter((team) => team.sources.length).length}/30 club badges to ${output}`);
