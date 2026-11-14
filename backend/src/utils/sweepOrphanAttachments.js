#!/usr/bin/env node
// One-off sweep (v0.27.1): delete files under UPLOAD_DIR that no attachment
// row points to. Before v0.27.1, permanently deleting a note (or emptying the
// Trash) dropped its attachment rows but left the files on disk.
//
// Dry run by default — lists what it would remove. Pass --delete to remove.
//   dev:  node src/utils/sweepOrphanAttachments.js [--delete]
//   prod: docker exec noted-api node src/utils/sweepOrphanAttachments.js [--delete]
//
// Safety: only files shaped like attachment storage (YYYY/MM/<note uuid>/<file>)
// are considered — tmp/ and anything else is never touched — and files modified
// in the last hour are skipped so an upload in flight (file written, row not yet
// inserted) can't be caught.
require('dotenv').config({
  path: process.env.NODE_ENV === 'production' ? '.env' : '.env.dev'
});
const path = require('path');
const fsp = require('fs/promises');
const { Pool } = require('pg');

const DELETE = process.argv.includes('--delete');
const MIN_AGE_MS = 60 * 60 * 1000;
const SHAPE = /^\d{4}\/\d{2}\/[0-9a-f-]{36}\/[^/]+$/i;

async function walk(dir, root, out) {
  for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, root, out);
    else if (entry.isFile()) out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

async function main() {
  const root = path.resolve(process.env.UPLOAD_DIR || './uploads');
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.DB_NAME || 'noted_dev',
    user: process.env.DB_USER || 'noteduser',
    password: process.env.DB_PASSWORD || 'noted_dev_password'
  });
  // Read the files first, then the rows: a file uploaded between the two reads
  // has its row by then (and is under an hour old anyway).
  const files = await walk(root, root, []);
  const { rows } = await pool.query('SELECT storage_path FROM attachments');
  await pool.end();
  const known = new Set(rows.map((r) => r.storage_path.split(path.sep).join('/')));

  const now = Date.now();
  let count = 0;
  let bytes = 0;
  for (const rel of files) {
    if (!SHAPE.test(rel) || known.has(rel)) continue;
    const full = path.join(root, rel);
    const stat = await fsp.stat(full);
    if (now - stat.mtimeMs < MIN_AGE_MS) continue;
    count++;
    bytes += stat.size;
    console.log(`${DELETE ? 'deleting' : 'would delete'}  ${rel}  (${stat.size} B)`);
    if (DELETE) await fsp.unlink(full);
  }
  console.log(`\n${count} orphaned file(s), ${(bytes / 1024 / 1024).toFixed(1)} MB` +
    ` — ${DELETE ? 'deleted' : 'dry run, nothing removed (pass --delete)'}.` +
    ` Scanned ${files.length} file(s), ${known.size} attachment row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
