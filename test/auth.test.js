import assert from 'node:assert/strict';
import test from 'node:test';
import { bootstrapAccount, hashPassword, sessionToken } from '../src/auth.js';

test('session token is read from Fetch and Express request headers', () => {
  assert.equal(sessionToken({ headers: new Headers({ cookie: 'other=x; ucl_session=fetch-token' }) }), 'fetch-token');
  assert.equal(sessionToken({ headers: { cookie: 'ucl_session=express-token; other=x' } }), 'express-token');
  assert.equal(sessionToken({ headers: {} }), null);
});

test('password hashing produces a salted scrypt value suitable for .env', async () => {
  const first = await hashPassword('temporary-test-password');
  const second = await hashPassword('temporary-test-password');
  assert.match(first, /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/);
  assert.notEqual(first, second);
});

test('account bootstrap is disabled when no account environment is configured', async () => {
  assert.equal(await bootstrapAccount(null, {}), null);
});

test('account bootstrap validates and upserts the configured administrator', async () => {
  const hash = `scrypt$${'a'.repeat(32)}$${'b'.repeat(128)}`;
  const calls = [];
  const pool = {
    async query(statement, values) {
      calls.push({ statement, values });
      return { rows: [{ id: 'admin-id', email: values[0], display_name: values[1] }] };
    },
  };
  const user = await bootstrapAccount(pool, {
    TOURNAMENT_EMAIL: ' Admin@Example.com ',
    TOURNAMENT_DISPLAY_NAME: 'Mark',
    TOURNAMENT_PASSWORD_HASH: hash,
  });
  assert.deepEqual(user, { id: 'admin-id', email: 'admin@example.com', display_name: 'Mark' });
  assert.deepEqual(calls[0].values, ['admin@example.com', 'Mark', hash]);
  assert.match(calls[0].statement, /ON CONFLICT \(email\) DO UPDATE/);
});

test('account bootstrap fails closed for partial or malformed configuration', async () => {
  await assert.rejects(() => bootstrapAccount({}, { TOURNAMENT_EMAIL: 'admin@example.com' }), /both TOURNAMENT_EMAIL and TOURNAMENT_PASSWORD_HASH/);
  await assert.rejects(() => bootstrapAccount({}, { TOURNAMENT_EMAIL: 'admin@example.com', TOURNAMENT_PASSWORD_HASH: 'plain-text-password' }), /not a valid generated scrypt hash/);
});
