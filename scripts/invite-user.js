import { createPool } from '../src/db.js';

const address = process.argv[2]?.trim().toLowerCase();
if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) throw new Error('Usage: npm run auth:invite -- person@example.com');
const pool = createPool();
if (!pool) throw new Error('Set DATABASE_URL in .env first.');
try {
  await pool.query('INSERT INTO whitelist_emails (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [address]);
  console.log(`Invited ${address}. They can now create an account on /login.`);
} finally {
  await pool.end();
}
