import { createPool } from "../src/db.js";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL in .env first.");
const connection = new URL(process.env.DATABASE_URL);
const database = decodeURIComponent(connection.pathname.slice(1));
if (!/^[a-z][a-z0-9_]{0,62}$/.test(database)) {
  throw new Error("Database name must contain lowercase letters, digits, or underscores (max 63 characters).");
}
connection.pathname = "/postgres";
const pool = createPool(connection.toString());
try {
  const existing = await pool.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (existing.rowCount) console.log(`Database ${database} already exists.`);
  else {
    await pool.query(`CREATE DATABASE "${database}"`);
    console.log(`Created database ${database}.`);
  }
} catch (error) {
  console.error("Database creation failed:", error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
