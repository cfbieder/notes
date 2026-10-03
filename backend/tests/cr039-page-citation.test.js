/**
 * CR039 A3 — "Fetch details": SSRF rejections in pageFetch and server-side
 * citation extraction. Pure: no server, no network (resolver is injected).
 * Run: node backend/tests/cr039-page-citation.test.js
 */

const { fetchPublicPage, PageFetchError } = require('../src/utils/pageFetch');
const { extractFromHtml } = require('../src/services/pageCitation');

let passed = 0;
let failed = 0;
function assert(cond, name) {
  if (cond) { console.log(`  ✓ ${name}`); passed++; } else { console.error(`  ✗ ${name}`); failed++; }
}

async function rejects(url, resolverAddrs, pattern, name) {
  const resolver = async () => resolverAddrs.map(address => ({ address }));
  try {
    await fetchPublicPage(url, { resolver });
    assert(false, name);
  } catch (err) {
    assert(err instanceof PageFetchError && pattern.test(err.message), `${name} (${err.message})`);
  }
}

async function run() {
  console.log('\n=== CR039 A3 page citation ===\n');

  console.log('SSRF rejections (before any connection):');
  await rejects('http://127.0.0.1/admin', [], /public/, 'loopback IP literal');
  await rejects('http://169.254.169.254/latest/meta-data', [], /public/, 'cloud metadata IP literal');
  await rejects('http://[::1]/', [], /public/, 'IPv6 loopback literal');
  await rejects('https://intranet.example', ['10.0.0.5'], /public/, 'hostname resolving to RFC1918');
  await rejects('https://tailnet.example', ['100.66.1.2'], /public/, 'hostname resolving to CGNAT / Tailscale');
  await rejects('https://mixed.example', ['93.184.216.34', '192.168.1.1'], /public/, 'any private record blocks (rebinding)');
  await rejects('https://nowhere.example', [], /could not be found/, 'unresolvable host');
  await rejects('ftp://example.com/file', [], /http and https/, 'non-http scheme');
  await rejects('https://user:pw@example.com/', [], /credentials/, 'URL with credentials');
  await rejects('not a url', [], /valid URL/, 'garbage input');

  console.log('\nExtraction (same extractor as the clipper):');
  const hw = extractFromHtml(`<!doctype html><html><head><title>x</title>
    <meta name="citation_title" content="Attention Is All You Need">
    <meta name="citation_author" content="Vaswani, Ashish">
    <meta name="citation_publication_date" content="2017/12/04">
    <meta name="citation_journal_title" content="NeurIPS">
    <meta name="citation_doi" content="10.5555/3295222.3295349"></head><body></body></html>`, 'https://papers.example.org/p/1');
  assert(hw.source_kind === 'journal' && hw.title === 'Attention Is All You Need' && hw.published === '2017-12-04'
    && hw.doi === '10.5555/3295222.3295349' && hw.authors[0].family === 'Vaswani', 'Highwire tags');

  const ld = extractFromHtml(`<html><head><link rel="canonical" href="/2024/05/chip-war">
    <script type="application/ld+json">{"@graph":[{"@type":"NewsArticle","headline":"Chip War","datePublished":"2024-05-02T09:30:00Z","author":{"name":"Jane Doe"},"publisher":{"name":"Example Times"}}]}</script>
    </head><body></body></html>`, 'https://times.example.com/amp/chip');
  assert(ld.title === 'Chip War' && ld.published === '2024-05-02' && ld.authors[0].family === 'Doe', 'JSON-LD @graph');
  assert(ld.url === 'https://times.example.com/2024/05/chip-war', 'relative canonical resolved against the page URL');

  const hostile = extractFromHtml(`<html><head><title>T</title>
    <script>globalThis.pwned = true;</script><script type="application/ld+json">{not json</script></head>
    <body onload="x()"></body></html>`, 'https://evil.example.com/');
  assert(hostile.title === 'T' && typeof globalThis.pwned === 'undefined', 'page scripts never run; malformed JSON-LD ignored');

  const bare = extractFromHtml('<html><head><title>Just a page</title></head></html>', 'https://www.example.net/a');
  assert(bare.container === 'example.net' && bare.authors.length === 0, 'fallback: title + hostname without www');

  console.log(`\n=== ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
