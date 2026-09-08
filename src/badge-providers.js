export const normalizeTeam = (value) => value.normalize("NFKD").replace(/\p{M}/gu, "")
  .toLowerCase().replaceAll("ø", "o").replaceAll("ß", "ss").replace(/[^a-z0-9]/g, "");

// Explicit aliases prevent fuzzy matching to youth, women's, or similarly named clubs.
export const teamAliases = {
  "Paris Saint-Germain": ["Paris SG", "Paris Saint-Germain FC"],
  "Bayern München": ["Bayern Munich", "FC Bayern München"],
  "Real Madrid": ["Real Madrid CF"],
  Liverpool: ["Liverpool FC"],
  Inter: ["Inter Milan", "FC Internazionale Milano", "Internazionale"],
  "Manchester City": ["Manchester City FC"],
  Arsenal: ["Arsenal FC"],
  Barcelona: ["FC Barcelona"],
  "Atlético de Madrid": ["Atletico Madrid", "Club Atlético de Madrid"],
  "Borussia Dortmund": ["BV Borussia 09 Dortmund"],
  Roma: ["AS Roma"],
  "Sporting CP": ["Sporting Lisbon", "Sporting Clube de Portugal"],
  "Aston Villa": ["Aston Villa FC"],
  Porto: ["FC Porto"],
  "Manchester United": ["Manchester United FC"],
  "Club Brugge": ["Club Brugge KV"],
  "Real Betis": ["Real Betis Balompié"],
  PSV: ["PSV Eindhoven"],
  Feyenoord: ["Feyenoord Rotterdam"],
  Lille: ["Lille OSC"],
  "Bodø/Glimt": ["Bodo Glimt", "Bodo/Glimt", "FK Bodø/Glimt"],
  Napoli: ["SSC Napoli"],
  "RB Leipzig": ["RasenBallsport Leipzig"],
  Villarreal: ["Villarreal CF"],
  Fenerbahçe: ["Fenerbahce", "Fenerbahçe SK"],
  "Shakhtar Donetsk": ["FC Shakhtar Donetsk"],
  Galatasaray: ["Galatasaray SK"],
  "Slavia Praha": ["Slavia Prague", "SK Slavia Praha"],
  "Slovan Bratislava": ["ŠK Slovan Bratislava"],
  Stuttgart: ["VfB Stuttgart"],
};

export const searchNames = {
  "Paris Saint-Germain": "Paris SG", "Bayern München": "Bayern Munich",
  Inter: "Inter Milan", "Atlético de Madrid": "Atletico Madrid",
  Roma: "AS Roma", Porto: "FC Porto", PSV: "PSV Eindhoven",
  "Bodø/Glimt": "Bodo Glimt", Fenerbahçe: "Fenerbahce",
  "Slavia Praha": "Slavia Prague", Stuttgart: "VfB Stuttgart",
};

export function matchesTeam(canonical, candidate) {
  const accepted = [canonical, ...(teamAliases[canonical] || [])].map(normalizeTeam);
  return accepted.includes(normalizeTeam(candidate || ""));
}

export function validBadgeUrl(raw, provider) {
  const url = new URL(raw);
  const allowed = provider === "thesportsdb"
    ? ["www.thesportsdb.com", "thesportsdb.com", "r2.thesportsdb.com"]
    : ["crests.football-data.org"];
  if (url.protocol !== "https:" || !allowed.includes(url.hostname) || url.username || url.password) {
    throw new Error("Unexpected badge host");
  }
  return url;
}

export function imageExtension(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "webp";
  const svg = bytes.toString("utf8");
  if (/<svg[\s>]/i.test(svg) && !/<(?:script|foreignObject|!ENTITY)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["']\s*(?!#)[^"']+/i.test(svg)) return "svg";
  throw new Error("Unsupported or unsafe image response");
}
