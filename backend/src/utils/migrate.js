#!/usr/bin/env node

/**
 * Database Migration Runner
 *
 * Usage:
 *   node migrate.js dev        — Run pending migrations against dev database
 *   node migrate.js prod       — Run pending migrations against prod database
 *   node migrate.js create     — Create a new numbered migration file
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

function getDbConfig(env) {
  if (env === 'prod') {
    return {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: process.env.DB_NAME || 'noted_prod',
      user: process.env.DB_USER || 'noteduser',
      password: process.env.DB_PASSWORD
    };
  }
  // dev
  return {
    host: 'localhost',
    port: 5432,
    database: 'noted_dev',
    user: 'noteduser',
    password: 'noted_dev_password'
  };
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations_applied (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(pool) {
  const result = await pool.query(
    'SELECT name FROM migrations_applied ORDER BY name'
  );
  return new Set(result.rows.map(r => r.name));
}

async function runMigrations(env) {
  const pool = new Pool(getDbConfig(env));

  try {
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO migrations_applied (name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`  ✓ Applied: ${file}`);
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ Failed: ${file}`);
        console.error(`    ${err.message}`);
        process.exit(1);
      } finally {
        client.release();
      }
    }

    if (count === 0) {
      console.log('  No new migrations to apply.');
    } else {
      console.log(`  ${count} migration(s) applied.`);
    }
  } finally {
    await pool.end();
  }
}

function createMigration() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  const lastNum = files.length > 0
    ? parseInt(files[files.length - 1].split('_')[0], 10)
    : 0;

  const nextNum = String(lastNum + 1).padStart(3, '0');
  const name = process.argv[3] || 'unnamed';
  const filename = `${nextNum}_${name}.sql`;

  fs.writeFileSync(
    path.join(MIGRATIONS_DIR, filename),
    `-- Migration: ${filename}\n-- Created: ${new Date().toISOString()}\n\n`
  );

  console.log(`  Created: migrations/${filename}`);
}

// Main
const command = process.argv[2];

if (command === 'create') {
  createMigration();
} else if (command === 'dev' || command === 'prod') {
  console.log(`Running migrations (${command})...`);
  runMigrations(command).catch(err => {
    console.error('Migration error:', err.message);
    process.exit(1);
  });
} else {
  console.log('Usage: node migrate.js <dev|prod|create> [name]');
  process.exit(1);
}
