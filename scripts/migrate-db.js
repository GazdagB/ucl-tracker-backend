import { createPool } from "../src/db.js";
import { groupsSchema } from "../src/groups.js";
import { matchesSchema } from "../src/matches.js";
import { authSchema } from "../src/auth.js";
import { knockoutSchema } from "../src/knockout.js";

const pool = createPool();
if (!pool) throw new Error("Set DATABASE_URL in .env first.");
try {
  await pool.query(groupsSchema);
  await pool.query(matchesSchema);
  await pool.query(knockoutSchema);
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await pool.query(authSchema);
  console.log("Tournament draw and match storage are ready.");
} finally { await pool.end(); }
