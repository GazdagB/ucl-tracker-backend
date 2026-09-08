import { createPool } from "../src/db.js";
import { bootstrapAccount } from "../src/auth.js";

const pool = createPool();
if (!pool) throw new Error("Set DATABASE_URL in .env before resetting PostgreSQL.");
if (!process.env.TOURNAMENT_EMAIL || !process.env.TOURNAMENT_PASSWORD_HASH) {
  throw new Error("Configure TOURNAMENT_EMAIL and TOURNAMENT_PASSWORD_HASH before resetting so the administrator account can be restored.");
}

try {
  await pool.query("BEGIN");
  await pool.query(`
    TRUNCATE TABLE
      sessions,
      whitelist_emails,
      knockout_results,
      match_results,
      tournament_draws,
      users
    RESTART IDENTITY CASCADE
  `);
  await pool.query("COMMIT");
  await bootstrapAccount(pool);
  console.log("Tournament data was reset and the administrator account was restored.");
} catch (error) {
  await pool.query("ROLLBACK").catch(() => {});
  throw error;
} finally {
  await pool.end();
}
