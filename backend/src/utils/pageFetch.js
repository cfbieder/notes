// CR039 A3 (§16 #14) — fetch a public web page's HTML for "Fetch details".
//
// The URL is user-supplied, so this is an SSRF surface. Every hop (including
// each redirect) is resolved and classified with ssrfGuard.classifyIp, only
// PUBLIC addresses are allowed — no AI_PROVIDER_ALLOW_PRIVATE opt-in here, a
// page lookup never needs the LAN or tailnet — and the connection is pinned to
// the address that was checked, so DNS cannot be rebound between check and
// connect. Bounded: 10 s overall, 2 MB body, 3 redirects, HTML only.

const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const net = require('net');
const { classifyIp } = require('./ssrfGuard');

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

class PageFetchError extends Error {}

async function resolvePublic(hostname, resolver) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(host)
    ? [host]
    : (await resolver(host).catch(() => [])).map(r => (typeof r === 'string' ? r : r.address));
  if (addresses.length === 0) throw new PageFetchError('That address could not be found');
  for (const addr of addresses) {
    if (classifyIp(addr) !== 'public') throw new PageFetchError('Only public web pages can be fetched');
  }
  return addresses[0];
}

function requestOnce(u, address, deadline) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NotedCitationFetcher/1.0)',
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'
      },
      // Pin the socket to the address that was checked (keeps SNI/Host intact).
      // Node 20's happy-eyeballs connect asks with { all: true } and expects a list.
      lookup: (_host, opts, cb) => (opts && opts.all
        ? cb(null, [{ address, family: net.isIP(address) }])
        : cb(null, address, net.isIP(address))),
      timeout: Math.max(1, deadline - Date.now())
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        resolve({ redirect: new URL(res.headers.location, u).toString() });
        return;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new PageFetchError(`The page answered ${status}`));
        return;
      }
      const type = String(res.headers['content-type'] || '');
      if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
        res.resume();
        reject(new PageFetchError(type.includes('pdf')
          ? 'That is a PDF — upload it as a PDF source instead'
          : 'That address is not a web page'));
        return;
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) {
          req.destroy(new PageFetchError('The page is too large to read'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => resolve({ html: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new PageFetchError('The page took too long to respond')));
    req.on('error', (err) => reject(err instanceof PageFetchError ? err : new PageFetchError('The page could not be reached')));
    req.end();
  });
}

// Returns { html, finalUrl }. Throws PageFetchError with a user-safe message.
async function fetchPublicPage(urlString, opts = {}) {
  const resolver = opts.resolver || ((h) => dns.lookup(h, { all: true }));
  const deadline = Date.now() + TIMEOUT_MS;
  let current = urlString;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u;
    try {
      u = new URL(current);
    } catch {
      throw new PageFetchError('That is not a valid URL');
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new PageFetchError('Only http and https pages can be fetched');
    if (u.username || u.password) throw new PageFetchError('URLs with credentials are not fetched');
    const address = await resolvePublic(u.hostname, resolver);
    const result = await requestOnce(u, address, deadline);
    if (result.redirect) {
      current = result.redirect;
      continue;
    }
    return { html: result.html, finalUrl: u.toString() };
  }
  throw new PageFetchError('The page redirected too many times');
}

module.exports = { fetchPublicPage, PageFetchError };
