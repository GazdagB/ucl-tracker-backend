import { defineRailway, github, preserve, project, service } from "railway/iac";

// Last resort for a per-service CaC repo. Prefer one .railway file for the
// project and drop this if you later combine services into that file.
export const partial = "backend";

export default defineRailway(() => {
  const backend = service("backend", {
    source: github("GazdagB/ucl-tracker-backend", { branch: "main" }),
    start: "npm start",
    healthcheck: "/api/health",
    healthcheckTimeout: 100,
    preDeploy: "npm run db:migrate",
    env: {
      DATABASE_URL: preserve(),
      FOOTBALL_DATA_API_KEY: preserve(),
      NODE_ENV: preserve(),
      TOURNAMENT_DISPLAY_NAME: preserve(),
      TOURNAMENT_EMAIL: preserve(),
      TOURNAMENT_PASSWORD_HASH: preserve(),
    },
    // builder from CaC: "NIXPACKS"
  });
  return project("ucl-tournament-tracker", {
    resources: [backend],
  });
});
