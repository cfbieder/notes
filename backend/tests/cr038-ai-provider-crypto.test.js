/**
 * CR038 — AI provider key crypto tests
 * Run: node backend/tests/cr038-ai-provider-crypto.test.js
 * No DB or running server required (pure unit test).
 */

const crypto = require('crypto');

let passed = 0;
let failed = 0;

function assert(condition, name) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ ${name}`);
    failed++;
  }
}

function run() {
  console.log('\n=== CR038 AI Provider Crypto Tests ===\n');

  // Fresh require after setting env so getMasterKey() sees it.
  process.env.AI_KEYS_ENC_KEY = crypto.randomBytes(32).toString('hex');
  delete require.cache[require.resolve('../src/utils/aiProviderCrypto')];
  const cryptoUtil = require('../src/utils/aiProviderCrypto');

  console.log('Configuration:');
  assert(cryptoUtil.isConfigured() === true, 'isConfigured() true with a valid 64-hex key');

  console.log('\nRound-trip:');
  const secret = 'sk-ant-api03-EXAMPLE-not-a-real-key-1234567890';
  const blob = cryptoUtil.encrypt(secret);
  assert(Buffer.isBuffer(blob), 'encrypt() returns a Buffer');
  assert(blob.length > 28, 'blob is longer than iv(12)+tag(16)');
  assert(!blob.toString('utf8').includes(secret), 'plaintext does not appear in ciphertext');
  assert(cryptoUtil.decrypt(blob) === secret, 'decrypt() recovers the original plaintext');

  console.log('\nNonce uniqueness:');
  const a = cryptoUtil.encrypt(secret);
  const b = cryptoUtil.encrypt(secret);
  assert(!a.equals(b), 'same plaintext encrypts to different ciphertext (random IV)');

  console.log('\nTamper detection (GCM auth):');
  const tampered = Buffer.from(blob);
  tampered[tampered.length - 1] ^= 0xff; // flip a ciphertext byte
  let threwOnTamper = false;
  try { cryptoUtil.decrypt(tampered); } catch { threwOnTamper = true; }
  assert(threwOnTamper, 'decrypt() throws on tampered ciphertext');

  console.log('\nWrong key:');
  process.env.AI_KEYS_ENC_KEY = crypto.randomBytes(32).toString('hex');
  delete require.cache[require.resolve('../src/utils/aiProviderCrypto')];
  const cryptoUtil2 = require('../src/utils/aiProviderCrypto');
  let threwOnWrongKey = false;
  try { cryptoUtil2.decrypt(blob); } catch { threwOnWrongKey = true; }
  assert(threwOnWrongKey, 'decrypt() with a different master key fails (no plaintext leak)');

  console.log('\nFail-closed when unconfigured:');
  delete process.env.AI_KEYS_ENC_KEY;
  delete require.cache[require.resolve('../src/utils/aiProviderCrypto')];
  const cryptoUtil3 = require('../src/utils/aiProviderCrypto');
  assert(cryptoUtil3.isConfigured() === false, 'isConfigured() false when env key is absent');
  let threwOnEncrypt = false;
  try { cryptoUtil3.encrypt('x'); } catch { threwOnEncrypt = true; }
  assert(threwOnEncrypt, 'encrypt() throws (fail-closed) when no key configured');

  console.log('\nMalformed key rejected:');
  process.env.AI_KEYS_ENC_KEY = 'too-short';
  delete require.cache[require.resolve('../src/utils/aiProviderCrypto')];
  const cryptoUtil4 = require('../src/utils/aiProviderCrypto');
  assert(cryptoUtil4.isConfigured() === false, 'isConfigured() false for a non-64-hex key');

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run();
