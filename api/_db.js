const pg = require('pg')
const { requireEnv } = require('./_utils.js')

const { Pool } = pg

let pool

function getPool(){
  if(pool) return pool
  const connectionString = requireEnv('DATABASE_URL')
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false }
  })
  return pool
}

let schemaReady = false
async function ensureSchema(){
  if(schemaReady) return
  const p = getPool()
  // Minimal schema. Uses BIGSERIAL ids for maximum compatibility.
  const sql = `
  CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    nickname TEXT NOT NULL,
    discord TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS wallets (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS game_rounds (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    game TEXT NOT NULL,
    bet_total NUMERIC NOT NULL,
    result JSONB NOT NULL DEFAULT '{}'::jsonb,
    payout NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ
  );
  `
  await p.query(sql)
  schemaReady = true
}

module.exports = { getPool, ensureSchema }
