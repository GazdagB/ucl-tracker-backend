import pg from "pg";

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) return null;
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 3000,
    query_timeout: 3000,
    max: 5,
  });
  pool.on("error", (error) => {
    console.error("Unexpected database connection error:", error.message);
  });
  return pool;
}
