/**
 * CR038 — AI provider config repository tests (against dev DB)
 * Run: node backend/tests/cr038-provider-config.test.js
 * Requires: dev Postgres up (docker compose -f docker-compose.dev.yml up -d).
 */

const crypto = require('crypto');
process.env.AI_KEYS_ENC_KEY = crypto.randomBytes(32).toString('hex');

const { Pool } = require('pg');
const repo = require('../src/services/ai/providerConfig');

let passed = 0;
let failed = 0;
function assert(cond, name) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.error(`  ✗ ${name}`); failed++; }
}

async function run() {
  console.log('\n=== CR038 Provider Config Repo Tests ===\n');
  const db = new Pool({
    host: 'localhost', port: 5432, database: 'noted_dev',
    user: 'noteduser', password: 'noted_dev_password'
  });

  // Use (or create) a throwaway user so we never touch real data.
  const email = `cr038-test-${Date.now()}@example.com`;
  const { rows: urows } = await db.query(
    `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, 'x') RETURNING id`,
    [`cr038_${Date.now()}`, email]
  );
  const userId = urows[0].id;

  try {
    console.log('Env fallback (no row):');
    let resolved = await repo.resolveCapability(db, userId, 'text');
    assert(resolved.provider === 'gateway' && resolved.source === 'env',
      'resolveCapability falls back to gateway/env when no row exists');

    console.log('\nUpsert with key:');
    const secret = 'sk-openai-EXAMPLE-1234567890';
    let cfg = await repo.upsertConfig(db, userId, 'text', {
      provider: 'openai',
      modelConfig: { quick: 'gpt-x-mini', deep: 'gpt-x', condense: 'gpt-x-mini' },
      apiKey: secret
    });
    assert(cfg.provider === 'openai', 'upsert returns provider');
    assert(cfg.hasKey === true, 'sanitized config reports hasKey');
    assert(!('apiKey' in cfg) && !('key_encrypted' in cfg), 'sanitized config omits the key');
    assert(cfg.modelConfig.deep === 'gpt-x', 'model tier map persisted');

    console.log('\nKey never surfaces via list:');
    const list = await repo.listConfigs(db, userId);
    const asJson = JSON.stringify(list);
    assert(!asJson.includes(secret), 'listConfigs output contains no plaintext key');

    console.log('\nDecrypt on the internal path only:');
    const row = await repo.getRow(db, userId, 'text');
    assert(repo.getDecryptedKey(row) === secret, 'getDecryptedKey recovers the stored key');

    console.log('\nUpdate WITHOUT touching the key (apiKey undefined):');
    cfg = await repo.upsertConfig(db, userId, 'text', {
      provider: 'openai', modelConfig: { quick: 'gpt-x-mini', deep: 'gpt-x-pro' }
      // apiKey omitted
    });
    const row2 = await repo.getRow(db, userId, 'text');
    assert(repo.getDecryptedKey(row2) === secret, 'key preserved when apiKey is omitted');
    assert(cfg.modelConfig.deep === 'gpt-x-pro', 'model map updated alongside preserved key');

    console.log('\nClear the key (apiKey null):');
    cfg = await repo.upsertConfig(db, userId, 'text', {
      provider: 'openai', modelConfig: {}, apiKey: null
    });
    assert(cfg.hasKey === false, 'hasKey false after clearing');
    assert(repo.getDecryptedKey(await repo.getRow(db, userId, 'text')) === null, 'key is gone');

    console.log('\nResolve prefers DB row when present:');
    resolved = await repo.resolveCapability(db, userId, 'text');
    assert(resolved.provider === 'openai' && resolved.source === 'db',
      'resolveCapability returns the DB row when one exists');

    console.log('\nDelete:');
    await repo.deleteConfig(db, userId, 'text');
    resolved = await repo.resolveCapability(db, userId, 'text');
    assert(resolved.source === 'env', 'after delete, resolution falls back to env again');
  } finally {
    // Clean up the throwaway user (cascades to its config rows).
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    await db.end();
  }

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => { console.error(err); process.exit(1); });
