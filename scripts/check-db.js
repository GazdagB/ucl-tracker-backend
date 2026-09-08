import { createPool } from "../src/db.js";

const pool = createPool();
if (!pool) throw new Error("Set DATABASE_URL in .env before checking PostgreSQL.");
try {
  const result = await pool.query("SELECT current_database() AS database, version() AS version");
  console.log(result.rows[0]);
} catch (error) {
  console.error("Database check failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
