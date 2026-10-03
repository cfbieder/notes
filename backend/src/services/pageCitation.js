// CR039 A3 (§16 #14) — citation metadata for a URL, for "Fetch details".
//
// Fetches the page through utils/pageFetch (public hosts only, pinned, bounded)
// and runs the SAME extractor the clipper injects into pages
// (citationMetadata.js, a byte-identical copy of clipper/metadata.js enforced by
// ci-guards) against a linkedom DOM. linkedom never executes the page's
// scripts; the extractor itself is our own code, run in a fresh vm context.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { parseHTML } = require('linkedom');
const { fetchPublicPage } = require('../utils/pageFetch');

const EXTRACTOR = new vm.Script(
  fs.readFileSync(path.join(__dirname, 'citationMetadata.js'), 'utf8'),
  { filename: 'citationMetadata.js' }
);

function extractFromHtml(html, pageUrl) {
  const { window, document } = parseHTML(html);
  const location = new URL(pageUrl);
  const context = vm.createContext({ window, document, location });
  EXTRACTOR.runInContext(context, { timeout: 1000 });
  const result = vm.runInContext('window.__notedExtractCitation()', context, { timeout: 1000 });
  // Normalize objects created in the other context, and resolve a relative
  // canonical URL (linkedom's .href is the raw attribute, unlike a browser's).
  const data = JSON.parse(JSON.stringify(result));
  try {
    data.url = new URL(data.url || pageUrl, pageUrl).toString();
  } catch {
    data.url = pageUrl;
  }
  return data;
}

async function citationFromUrl(url) {
  const { html, finalUrl } = await fetchPublicPage(url);
  return extractFromHtml(html, finalUrl);
}

module.exports = { citationFromUrl, extractFromHtml };
