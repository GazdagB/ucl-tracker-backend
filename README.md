# Fantasy UCL Tracker — backend

JavaScript API built with Node.js, Express, and PostgreSQL 18. This folder is an independent Git repository.

## Local development

Requires Node.js 22+ and PostgreSQL 18. Your existing PostgreSQL 18 instance uses port **5433**.

```powershell
npm install
Copy-Item .env.example .env
# Edit .env with your PostgreSQL credentials before running database commands.
npm run db:create
npm run db:check
npm run db:migrate
npm run dev
```

Skip the copy if `.env` already exists. The initial setup includes an ignored `.env` with a password placeholder. URL-encode special characters in the password within `DATABASE_URL`. Never commit `.env`.

`db:create` creates only the database named in `DATABASE_URL` if it does not exist. It requires a PostgreSQL user with permission to create databases. `db:migrate` creates the tournament draw table without replacing existing data.

The API listens on port 4000. `npm start` runs without watching files, and `npm test` runs the API tests.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | API liveness; works without a database |
| `GET /api/ready` | Checks PostgreSQL; returns 503 until it is available |
| `GET /api/groups` | Latest saved draw, live group standings, and the default 2026/27 roster |
| `POST /api/groups` | Generate and save a draw from three players, 30 unique teams, and expectedVersion |
| `GET /api/knockout` | Qualification, seeded bracket, progress, and champion for the current draw |
| `POST /api/knockout` | Save a knockout score and advancing team |

Draws create ten groups of three, with every player represented once per group. Each player owns ten teams; clubs never repeat. New draws are stored as numbered snapshots; previous snapshots remain in PostgreSQL. Concurrent redraws are serialized and a stale expectedVersion returns HTTP 409.

Matchday storage keeps one result per fixture and draw version. The 30 group fixtures use one continuous Matchday 1–30 sequence while their stable group fixture keys preserve saved results. Scores are whole numbers from 0–99. Completed results require one goal-scorer record for every goal, with a team side and player name. The groups endpoint calculates a live table for every group with played, wins, draws, losses, goals, goal difference, and points. The leaderboard endpoint calculates 3 points for a win, 1 for a draw, and 0 for a loss, plus played, wins, draws, losses, and goals scored.

The knockout stage opens when all 30 group fixtures are complete. The ten group winners and six best runners-up qualify and receive seeds 1–16. Knockout scores and goal scorers persist per draw, winners advance automatically, tied scores require an explicit advancing team, and the final winner identifies both the champion club and its assigned gamer. The leaderboard aggregates recorded group and knockout goals into the tournament Golden Boot ranking.

The default roster in `src/roster.js` uses Joel, Balázs, and Mark and the first 30 clubs in UEFA's published 2026/27 draw-seeding order, checked 7 September 2026. The excluded six are AEK Athens, LASK, Como, Lens, Viking, and Sabah. This is a home tournament selection rule, not FC26 team ratings. The source URL is saved with the roster.

`npm test` checks the API and draw invariants; `npm run test:db` verifies persistence and concurrent redraws using a temporary test schema in the configured database, then removes only that test schema.

`npm run db:reset` removes all draws, group and knockout results, sessions, invitations, and users from the configured database, then restores only the `.env` administrator account. It requires both administrator variables and is intended for starting a fresh tournament.

Authentication endpoints are available at `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, and `/api/auth/me`. The user-facing screen is login-only. Passwords are scrypt hashes and sessions use HttpOnly cookies with 30-day expiry.

Invite a person without editing the database directly:

```powershell
npm run auth:invite -- person@example.com
```

All tournament pages and data APIs require a valid session. Only authentication plus health/readiness checks are public.

For a single `.env`-managed account, generate a password hash locally so the raw password is never stored:

```powershell
npm run auth:hash
```

Copy the printed hash into `.env` together with the account email. The server creates or updates that one account at startup:

```dotenv
TOURNAMENT_EMAIL=you@example.com
TOURNAMENT_DISPLAY_NAME=Your Name
TOURNAMENT_PASSWORD_HASH=scrypt$...
```

## Club crest downloads

Run `npm run badges:sync` from this folder to cache the 30 default clubs' crests in `../frontend/public/team-badges`. For separate checkouts, pass the frontend's destination: `npm run badges:sync -- "PATH_TO_FRONTEND/public/team-badges"`.

TheSportsDB uses its documented free shared key, 123, unless `THESPORTSDB_API_KEY` is configured. Set `FOOTBALL_DATA_API_KEY` in the ignored `.env` to enable football-data.org's free API. Keys are used only by the download script; they are never written to the frontend or badge manifest.

The script checks explicit club aliases and Soccer sport metadata, spaces TheSportsDB lookups below its free rate limit, and saves provider IDs, club names, source image URLs, and local paths in `manifest.json`. Unrelated or ambiguous club matches are skipped. Download failures preserve existing cached crests. The frontend tries TheSportsDB first, then football-data.org, then club initials if neither local image loads. Edited/custom club names outside this catalogue show initials.

Both provider links and the required Football-Data attribution appear on the groups page. Provider access does not transfer club artwork rights. See the providers' terms: [TheSportsDB](https://www.thesportsdb.com/docs_terms_of_use.php) and [football-data.org](https://www.football-data.org/client/register).

## Hosting preparation

The server reads `DATABASE_URL` and `PORT` from its environment and listens on all interfaces. `.railway/railway.ts` connects the GitHub source, preserves service variables, runs `npm run db:migrate` before each deployment, starts with `npm start`, and checks `/api/health`. On Railway, attach PostgreSQL and configure `DATABASE_URL`, `TOURNAMENT_EMAIL`, `TOURNAMENT_DISPLAY_NAME`, and `TOURNAMENT_PASSWORD_HASH`; Railway supplies `PORT` automatically.

## Connect your remote

Create an empty remote repository, then run from this folder, replacing the URL:

```powershell
git add .
git commit -m "Initial backend setup"
git remote add origin <YOUR_BACKEND_REPOSITORY_URL>
git push -u origin main
```
