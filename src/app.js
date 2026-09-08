import express from "express";
import { DrawError, getLatestDraw, saveDraw, validateDraw } from "./groups.js";
import { getMatches, goldenBootFromMatches, groupStandingsFromMatches, leaderboardFromMatches, saveMatch } from "./matches.js";
import { currentUser, login, logout, register } from "./auth.js";
import { defaultRoster } from "./roster.js";
import { getSquad } from "./squads.js";
import { getKnockout, saveKnockoutMatch } from "./knockout.js";

export function createApp({ pool = null } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  // Liveness is independent of database availability.
  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", service: "fantasy-ucl-tracker-api" });
  });

  app.get("/api/ready", async (_request, response) => {
    if (!pool) {
      return response.status(503).json({ status: "not_ready", database: "not_configured" });
    }
    try {
      await pool.query("SELECT 1");
      return response.json({ status: "ok", database: "connected" });
    } catch {
      return response.status(503).json({ status: "not_ready", database: "unavailable" });
    }
  });

  app.post("/api/auth/register", async (request, response) => {
    if (!pool) return response.status(503).json({ error: "Database is not configured." });
    if (process.env.TOURNAMENT_EMAIL) return response.status(403).json({ error: "This tournament uses a single administrator account." });
    const result = await register(pool, request.body);
    response.set("Set-Cookie", result.setCookie).status(201).json({ user: result.user });
  });
  app.post("/api/auth/login", async (request, response) => {
    if (!pool) return response.status(503).json({ error: "Database is not configured." });
    const result = await login(pool, request.body);
    response.set("Set-Cookie", result.setCookie).json({ user: result.user });
  });
  app.post("/api/auth/logout", async (request, response) => {
    if (!pool) return response.status(503).json({ error: "Database is not configured." });
    const result = await logout(pool, request);
    response.set("Set-Cookie", result.setCookie).json({ ok: true });
  });
  app.get("/api/auth/me", async (request, response) => {
    if (!pool) return response.status(503).json({ error: "Database is not configured." });
    response.set("Cache-Control", "no-store");
    response.json({ user: await currentUser(pool, request) });
  });

  app.use('/api', async (request, response, next) => {
    if (!pool) return response.status(503).json({ error: 'Database is not configured.' });
    const user = await currentUser(pool, request);
    if (!user) return response.status(401).json({ error: 'Log in to access the tournament.' });
    request.user = user;
    next();
  });

  app.get("/api/groups", async (_request, response) => {
    response.set("Cache-Control", "no-store");
    if (!pool) return response.status(503).json({ error: "Database is not configured." });
    const data = await getMatches(pool);
    response.json({ draw: data.draw, groupStandings: groupStandingsFromMatches(data.draw, data.fixtures), defaults: defaultRoster });
  });

  app.post("/api/groups", async (request, response) => {
    response.set("Cache-Control", "no-store");
    validateDraw(request.body);
    if (!pool) return response.status(503).json({ error: "Database is not configured." });
    response.status(201).json({ draw: await saveDraw(pool, request.body) });
  });

  app.get("/api/matches", async (_request, response) => {
    response.set("Cache-Control", "no-store");
    if (!pool) return response.status(503).json({ error: "Database is not configured." });
    response.json(await getMatches(pool));
  });

  app.get('/api/squad', async (request, response) => {
    if (!pool) return response.status(503).json({ error: 'Database is not configured.' });
    const draw = await getLatestDraw(pool);
    const team = request.query.team;
    if (typeof team !== 'string' || !draw?.teams.includes(team)) return response.status(400).json({ error: 'Choose a team from the current draw.' });
    response.json(await getSquad(team));
  });

  app.post("/api/matches", async (request, response) => {
    response.set("Cache-Control", "no-store");
    if (!pool) return response.status(503).json({ error: "Database is not configured." });
    response.status(201).json({ result: await saveMatch(pool, request.body) });
  });

  app.get('/api/knockout', async (_request, response) => {
    response.set('Cache-Control', 'no-store');
    if (!pool) return response.status(503).json({ error: 'Database is not configured.' });
    response.json(await getKnockout(pool));
  });

  app.post('/api/knockout', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    if (!pool) return response.status(503).json({ error: 'Database is not configured.' });
    response.status(201).json({ result: await saveKnockoutMatch(pool, request.body) });
  });

  app.get("/api/leaderboard", async (_request, response) => {
    response.set("Cache-Control", "no-store");
    if (!pool) return response.status(503).json({ error: "Database is not configured." });
    const data = await getMatches(pool);
    const knockout = await getKnockout(pool);
    const knockoutFixtures = knockout.rounds.flatMap(round => round.fixtures);
    const allFixtures = [...data.fixtures, ...knockoutFixtures];
    const goldenBoot = goldenBootFromMatches(allFixtures);
    const teams = [...new Set(goldenBoot.map(entry => entry.team))];
    const squads = new Map(await Promise.all(teams.map(async team => {
      try { return [team, (await getSquad(team)).players]; }
      catch { return [team, []]; }
    })));
    const goldenBootWithImages = goldenBoot.map(entry => ({ ...entry, image: squads.get(entry.team)?.find(player => player.name === entry.player)?.image || null }));
    response.json({ draw: data.draw, leaderboard: leaderboardFromMatches(data.draw, allFixtures, knockout.champion?.player), goldenBoot: goldenBootWithImages });
  });

  app.use((_request, response) => {
    response.status(404).json({ error: "Not found" });
  });
  app.use((error, _request, response, _next) => {
    if (error instanceof DrawError) {
      return response.status(error.status).json({ error: error.message });
    }
    const status = error.status === 400 || error.status === 413 ? error.status : 500;
    response.status(status).json({ error: status === 500 ? "Internal server error" : "Invalid request body" });
  });
  return app;
}
