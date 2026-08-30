/**
 * CR038 — text provider dispatch decision tests
 * Run: node backend/tests/cr038-dispatch.test.js
 * Pure unit test (no DB, no network, no gateway).
 */

const llmService = require('../src/services/llmService');

let passed = 0;
let failed = 0;
function assert(cond, name) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.error(`  ✗ ${name}`); failed++; }
}

function run() {
  console.log('\n=== CR038 Dispatch Decision Tests ===\n');
  const pick = llmService.pickTextProvider;

  assert(pick(null) === 'gateway', 'null resolution → gateway (no user/db)');
  assert(pick({ source: 'env', provider: 'gateway' }) === 'gateway', 'env fallback → gateway');
  assert(pick({ source: 'db', provider: 'gateway' }) === 'gateway', 'DB row set to gateway → gateway');
  assert(pick({ source: 'db', provider: 'openai' }) === 'openai', 'DB row openai → openai');
  assert(pick({ source: 'db', provider: 'anthropic' }) === 'anthropic', 'DB row anthropic → anthropic');
  assert(pick({ source: 'db', provider: 'openai_compatible' }) === 'openai_compatible',
    'DB row openai_compatible → openai_compatible');
  // Defensive: a provider value without a db source is treated as gateway.
  assert(pick({ source: 'env', provider: 'openai' }) === 'gateway', 'env source never selects a cloud provider');

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
