// CR039 A2 — citation metadata extraction, injected into the page being clipped.
// Defines window.__notedExtractCitation(); the popup calls it via
// chrome.scripting.executeScript. Sources are read in priority order (CR039 §8.1):
//   1. citation_* (Highwire / Google Scholar)   2. JSON-LD Article/Book types
//   3. article:* / og:*                          4. Dublin Core, meta author, canonical
//   5. fallback: document.title, hostname
// The first source that has a field wins. Everything found is returned in
// `raw` and stored as sources.metadata_raw for debugging.

(function () {
  function metas(name) {
    const sel = `meta[name="${name}" i], meta[property="${name}" i]`;
    return [...document.querySelectorAll(sel)].map(m => (m.getAttribute('content') || '').trim()).filter(Boolean);
  }
  const meta = (name) => metas(name)[0] || '';

  // "Family, Given" | "Given Middle Family" | a one-word or organization name.
  function parsePerson(name) {
    const n = String(name || '').replace(/\s+/g, ' ').trim();
    if (!n || /^https?:\/\//i.test(n)) return null;
    if (n.includes(',')) {
      const [family, ...rest] = n.split(',');
      const given = rest.join(',').trim();
      return given ? { family: family.trim(), given } : { literal: family.trim() };
    }
    const parts = n.split(' ');
    if (parts.length === 1 || /\b(staff|editors?|team|news|inc\.?|ltd\.?|press|agency|reporters?)\b/i.test(n)) {
      return { literal: n };
    }
    return { family: parts[parts.length - 1], given: parts.slice(0, -1).join(' ') };
  }

  // "2019/03/13" | "2019-03-13T09:00:00Z" | "2019-03" | "2019" → "YYYY[-MM[-DD]]".
  function normalizeDate(value) {
    const v = String(value || '').trim();
    let m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = v.match(/^(\d{4})[-/](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}`;
    m = v.match(/^(\d{4})$/);
    if (m) return m[1];
    const t = Date.parse(v);
    return Number.isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
  }

  function jsonLdItems() {
    const out = [];
    const visit = (node) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(visit); return; }
      out.push(node);
      if (node['@graph']) visit(node['@graph']);
    };
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try { visit(JSON.parse(s.textContent)); } catch (_) { /* skip malformed block */ }
    }
    return out;
  }

  const LD_TYPES = ['NewsArticle', 'Article', 'BlogPosting', 'ScholarlyArticle', 'Report', 'Book', 'TechArticle', 'ReportageNewsArticle'];
  const typeOf = (item) => [].concat(item['@type'] || []);

  function ldName(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return ldName(v[0]);
    return v.name || '';
  }

  function ldAuthors(v) {
    return [].concat(v || []).map(a => (typeof a === 'string' ? a : a?.name)).filter(Boolean);
  }

  window.__notedExtractCitation = function () {
    const raw = { citation: {}, jsonld: null, og: {}, dc: {} };
    const pick = (...vals) => vals.find(v => v && String(v).trim()) || '';

    // 1. Highwire / Google Scholar
    const c = {
      title: meta('citation_title'),
      authors: metas('citation_author'),
      date: pick(meta('citation_publication_date'), meta('citation_date'), meta('citation_online_date'), meta('citation_cover_date')),
      journal: pick(meta('citation_journal_title'), meta('citation_conference_title')),
      book: meta('citation_inbook_title'),
      publisher: meta('citation_publisher'),
      volume: meta('citation_volume'),
      issue: meta('citation_issue'),
      firstpage: meta('citation_firstpage'),
      lastpage: meta('citation_lastpage'),
      doi: meta('citation_doi'),
      isbn: meta('citation_isbn'),
      url: pick(meta('citation_abstract_html_url'), meta('citation_public_url'))
    };
    Object.entries(c).forEach(([k, v]) => { if (v && (!Array.isArray(v) || v.length)) raw.citation[k] = v; });

    // 2. JSON-LD
    const ld = jsonLdItems().find(i => typeOf(i).some(t => LD_TYPES.includes(t))) || null;
    if (ld) {
      raw.jsonld = {
        type: typeOf(ld).join(','), headline: ld.headline || ld.name, authors: ldAuthors(ld.author),
        datePublished: ld.datePublished, publisher: ldName(ld.publisher), isPartOf: ldName(ld.isPartOf), url: ld.url
      };
    }

    // 3. Open Graph / article:*
    const og = {
      title: meta('og:title'), site: meta('og:site_name'), type: meta('og:type'),
      published: meta('article:published_time'), authors: metas('article:author')
    };
    Object.entries(og).forEach(([k, v]) => { if (v && (!Array.isArray(v) || v.length)) raw.og[k] = v; });

    // 4. Dublin Core + plain meta
    const dc = {
      title: meta('DC.title'), creators: metas('DC.creator'), date: meta('DC.date'), publisher: meta('DC.publisher'),
      author: pick(meta('author'), meta('parsely-author'), meta('sailthru.author'))
    };
    Object.entries(dc).forEach(([k, v]) => { if (v && (!Array.isArray(v) || v.length)) raw.dc[k] = v; });
    const canonical = document.querySelector('link[rel="canonical"]')?.href || '';

    // Merge, highest priority first.
    const authorNames = [c.authors, raw.jsonld?.authors, og.authors.filter(a => !/^https?:/i.test(a)), dc.creators,
      dc.author ? [dc.author] : []].find(list => list && list.length) || [];
    const ldTypes = ld ? typeOf(ld) : [];
    let kind = 'web';
    if (c.journal || ldTypes.includes('ScholarlyArticle')) kind = 'journal';
    else if (c.book) kind = 'book_chapter';
    else if (ldTypes.includes('Book') || c.isbn) kind = 'book';
    else if (ldTypes.includes('Report')) kind = 'pdf_report';
    else if (/^video/i.test(og.type)) kind = 'video';

    const pages = c.firstpage ? (c.lastpage ? `${c.firstpage}–${c.lastpage}` : c.firstpage) : '';

    return {
      source_kind: kind,
      title: pick(c.title, raw.jsonld?.headline, og.title, dc.title, document.title),
      authors: authorNames.map(parsePerson).filter(Boolean),
      container: pick(c.journal, c.book, raw.jsonld?.isPartOf, og.site, raw.jsonld?.publisher, location.hostname.replace(/^www\./, '')),
      publisher: pick(c.publisher, kind === 'web' ? '' : raw.jsonld?.publisher, dc.publisher),
      volume: c.volume, issue: c.issue, pages,
      published: normalizeDate(pick(c.date, raw.jsonld?.datePublished, og.published, dc.date)),
      url: pick(c.url, canonical, location.href),
      doi: c.doi.replace(/^(doi:|https?:\/\/(dx\.)?doi\.org\/)/i, ''),
      isbn: c.isbn,
      raw
    };
  };
})();
