/**
 * CR038 — SSRF guard tests
 * Run: node backend/tests/cr038-ssrf-guard.test.js
 * Pure unit test (no network — DNS is stubbed via an injected resolver).
 */

const { classifyIp, assertSafeProviderUrl } = require('../src/utils/ssrfGuard');

let passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; }
  else { console.error(`  ✗ ${name}`); failed++; }
}
async function rejects(promise, name) {
  try { await promise; assert(false, name + ' (should have thrown)'); }
  catch { assert(true, name); }
}
async function resolves(promise, name) {
  try { await promise; assert(true, name); }
  catch (e) { assert(false, name + ' (threw: ' + e.message + ')'); }
}

// Fake DNS: map hostnames to IPs so we can test classification deterministically.
const fakeDns = (map) => (host) => {
  if (!(host in map)) throw new Error('ENOTFOUND ' + host);
  return map[host];
};

async function run() {
  console.log('\n=== CR038 SSRF Guard Tests ===\n');

  console.log('classifyIp:');
  assert(classifyIp('127.0.0.1') === 'loopback', '127.0.0.1 → loopback');
  assert(classifyIp('169.254.169.254') === 'link-local', 'cloud metadata IP → link-local');
  assert(classifyIp('10.1.2.3') === 'private', '10/8 → private');
  assert(classifyIp('192.168.0.5') === 'private', '192.168/16 → private');
  assert(classifyIp('172.16.9.9') === 'private', '172.16/12 → private');
  assert(classifyIp('100.66.213.40') === 'private', 'Tailscale CGNAT 100.64/10 → private');
  assert(classifyIp('8.8.8.8') === 'public', '8.8.8.8 → public');
  assert(classifyIp('::1') === 'loopback', '::1 → loopback');
  assert(classifyIp('fe80::1') === 'link-local', 'fe80::/10 → link-local');
  assert(classifyIp('fd00::1') === 'private', 'fc00::/7 ULA → private');
  assert(classifyIp('::ffff:127.0.0.1') === 'loopback', 'IPv4-mapped loopback → loopback');
  assert(classifyIp('2606:4700:4700::1111') === 'public', 'public IPv6 → public');

  const dns = fakeDns({
    'api.openai.com': [{ address: '8.8.8.8' }],
    'evil.example.com': [{ address: '169.254.169.254' }],
    'rebind.example.com': [{ address: '8.8.8.8' }, { address: '10.0.0.5' }],
    'ollama.local': [{ address: '192.168.1.50' }]
  });

  console.log('\nDefault policy (allowPrivate=false):');
  await resolves(assertSafeProviderUrl('https://api.openai.com/v1', { resolver: dns, allowPrivate: false }),
    'public https host allowed');
  await rejects(assertSafeProviderUrl('http://api.openai.com/v1', { resolver: dns, allowPrivate: false }),
    'http rejected by default');
  await rejects(assertSafeProviderUrl('https://evil.example.com', { resolver: dns, allowPrivate: false }),
    'host resolving to cloud-metadata IP rejected');
  await rejects(assertSafeProviderUrl('https://rebind.example.com', { resolver: dns, allowPrivate: false }),
    'DNS-rebind (one public + one private A record) rejected');
  await rejects(assertSafeProviderUrl('https://ollama.local', { resolver: dns, allowPrivate: false }),
    'private LAN host rejected by default');
  await rejects(assertSafeProviderUrl('http://127.0.0.1:11434', { resolver: dns, allowPrivate: false }),
    'loopback literal rejected by default');
  await rejects(assertSafeProviderUrl('ftp://api.openai.com', { resolver: dns, allowPrivate: false }),
    'non-http(s) scheme rejected');
  await rejects(assertSafeProviderUrl('not a url', { resolver: dns, allowPrivate: false }),
    'malformed URL rejected');

  console.log('\nOperator opt-in (allowPrivate=true):');
  await resolves(assertSafeProviderUrl('http://127.0.0.1:11434', { resolver: dns, allowPrivate: true }),
    'loopback http allowed when opted in (local Ollama)');
  await resolves(assertSafeProviderUrl('http://ollama.local', { resolver: dns, allowPrivate: true }),
    'private LAN host allowed when opted in');
  await rejects(assertSafeProviderUrl('https://evil.example.com', { resolver: dns, allowPrivate: true }),
    'link-local STILL blocked even when opted in (metadata protection)');

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((e) => { console.error(e); process.exit(1); });
