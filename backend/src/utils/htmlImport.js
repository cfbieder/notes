// Shared HTML-import helpers used by both the manual uploader
// (routes/import.js) and the Google Drive importer (services/driveImporter.js)
// so the two paths derive titles and normalize body content identically.

// Pull <title>…</title>. Returns null if not present or empty.
function extractHtmlTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const title = m[1].replace(/\s+/g, ' ').trim();
  return title.length > 0 ? title : null;
}

// If the HTML is a full document, return only the body content (so the source
// view doesn't show <meta>/<title>/<link> boilerplate) but preserve any
// <style> blocks from <head> by prepending them — many self-contained
// documents define all of their CSS there, and stripping it leaves SVG
// diagrams unstyled. If no <body> tag, return as-is.
function extractHtmlBody(html) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) return html.trim();

  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return bodyMatch[1].trim();

  const headStyles = [];
  const styleRe = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
  let m;
  while ((m = styleRe.exec(headMatch[1])) !== null) {
    headStyles.push(m[0]);
  }

  const stylePrefix = headStyles.length ? headStyles.join('\n') + '\n' : '';
  return (stylePrefix + bodyMatch[1]).trim();
}

module.exports = { extractHtmlTitle, extractHtmlBody };
