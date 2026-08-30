'use strict';

// CR038 — SSRF guard for user-supplied AI provider base URLs.
//
// The server issues authenticated requests to a "local / openai-compatible"
// base URL chosen by a user, so an unchecked host is a classic SSRF pivot
// (cloud metadata, internal services). We resolve the host and classify every
// resolved IP:
//   - link-local (169.254/16, fe80::/10) and unspecified are ALWAYS blocked
//     (cloud metadata endpoint lives at 169.254.169.254 — never a real LLM).
//   - loopback and private/ULA/CGNAT are blocked by DEFAULT, but a legitimate
//     local provider (e.g. Ollama on localhost / a LAN box / a Tailscale IP)
//     needs them — so the operator opts in with AI_PROVIDER_ALLOW_PRIVATE=true,
//     which also permits http (otherwise https is required).
// Resolving all A/AAAA records and checking each also blunts DNS-rebinding;
// the returned addresses let the caller pin the connection to a checked IP.

const dnsPromises = require('dns').promises;
const net = require('net');

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + (parseInt(oct, 10) & 0xff), 0) >>> 0;
}

function inV4(ip, cidr, bits) {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(cidr) & mask);
}

function classifyIpv4(ip) {
  if (ip === '0.0.0.0' || inV4(ip, '0.0.0.0', 8)) return 'unspecified';
  if (inV4(ip, '127.0.0.0', 8)) return 'loopback';
  if (inV4(ip, '169.254.0.0', 16)) return 'link-local';
  if (inV4(ip, '10.0.0.0', 8)) return 'private';
  if (inV4(ip, '172.16.0.0', 12)) return 'private';
  if (inV4(ip, '192.168.0.0', 16)) return 'private';
  if (inV4(ip, '100.64.0.0', 10)) return 'private'; // CGNAT (incl. Tailscale)
  return 'public';
}

// Classify an IP address literal into a routability bucket.
function classifyIp(ip) {
  const fam = net.isIP(ip);
  if (fam === 4) return classifyIpv4(ip);
  if (fam === 6) {
    const lower = ip.toLowerCase();
    // IPv4-mapped (::ffff:a.b.c.d) — classify the embedded IPv4.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return classifyIpv4(mapped[1]);
    if (lower === '::') return 'unspecified';
    if (lower === '::1') return 'loopback';
    if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
        lower.startsWith('fea') || lower.startsWith('feb')) return 'link-local'; // fe80::/10
    if (lower.startsWith('fc') || lower.startsWith('fd')) return 'private';       // fc00::/7 ULA
    return 'public';
  }
  return 'public';
}

function allowPrivateEnabled() {
  return process.env.AI_PROVIDER_ALLOW_PRIVATE === 'true';
}

// Validate a user-supplied provider base URL. Throws Error (safe message, no
// internal detail beyond the classification) when the target is disallowed.
// `resolver` is injectable for tests; defaults to dns.lookup(all:true).
async function assertSafeProviderUrl(urlString, opts = {}) {
  const allowPrivate = opts.allowPrivate !== undefined ? opts.allowPrivate : allowPrivateEnabled();
  const resolver = opts.resolver || ((host) => dnsPromises.lookup(host, { all: true }));

  let u;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error('Invalid provider URL');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('Provider URL must use http or https');
  }
  if (u.protocol === 'http:' && !allowPrivate) {
    throw new Error('Provider URL must use https (set AI_PROVIDER_ALLOW_PRIVATE=true to allow http for local providers)');
  }

  const host = u.hostname;
  let addresses;
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    const records = await resolver(host);
    addresses = (Array.isArray(records) ? records : [records]).map((r) => (typeof r === 'string' ? r : r.address));
  }
  if (addresses.length === 0) {
    throw new Error('Provider host did not resolve to any address');
  }

  for (const addr of addresses) {
    const cls = classifyIp(addr);
    if (cls === 'link-local' || cls === 'unspecified') {
      throw new Error(`Provider URL resolves to a blocked ${cls} address`);
    }
    if ((cls === 'loopback' || cls === 'private') && !allowPrivate) {
      throw new Error(`Provider URL resolves to a ${cls} address — set AI_PROVIDER_ALLOW_PRIVATE=true to allow local providers`);
    }
  }
  return { host, addresses };
}

module.exports = { classifyIp, assertSafeProviderUrl, allowPrivateEnabled };
