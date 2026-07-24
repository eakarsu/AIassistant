'use strict';
require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../.env') });
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');

async function main() {
  if (process.env.ALLOW_SCHEMA_MIGRATION !== 'true') throw new Error('ALLOW_SCHEMA_MIGRATION=true is required');
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL, role VARCHAR(50) NOT NULL DEFAULT 'viewer', created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await pool.query(fs.readFileSync(path.resolve(__dirname, '../migrations/001_governed_cited_answer.sql'), 'utf8'));
  await pool.query(`CREATE TABLE IF NOT EXISTS ai_results (
    id SERIAL PRIMARY KEY, feature VARCHAR(100) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    entity_type VARCHAR(50), entity_id INTEGER, prompt_summary TEXT,
    result JSONB NOT NULL DEFAULT '{}'::jsonb, model VARCHAR(100), created_at TIMESTAMP DEFAULT NOW()
  )`);
  const email = (process.env.DEFAULT_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.DEFAULT_PASSWORD || process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 12) throw new Error('Runtime administrator credentials are required');
  await pool.query(
    `INSERT INTO users(email,password,name,role) VALUES($1,$2,$3,'admin')
     ON CONFLICT(email) DO UPDATE SET password=EXCLUDED.password,name=EXCLUDED.name,role='admin'`,
    [email, await bcrypt.hash(password, 12), 'Runtime Administrator'],
  );
  await pool.end();
}

main().catch((error) => { console.error(error.message); process.exit(1); });
