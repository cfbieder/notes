// CR039 A3 — read a PDF's text layer and info fields with headless PDF.js
// (the approach CR025 specifies: fast, free, no gateway). Scanned PDFs have no
// text layer; callers fall back to OCR. pdfjs-dist >= 6.2.108 is required
// (GHSA-hq66-cqwq-w95j), and eval is disabled for untrusted input.

const MAX_TEXT_CHARS = 400_000; // keeps notes.content_tsv under Postgres' 1 MB tsvector limit

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs');
  return pdfjsPromise;
}

// True when the buffer starts with the PDF magic bytes (sniff, don't trust names).
function looksLikePdf(buffer) {
  return buffer.length > 5 && buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
}

// "Doe, Jane; Roe, John" | "Jane Doe and John Roe" → author names (strings).
function splitAuthorField(value) {
  return String(value || '').split(/\s*;\s*|\s+and\s+|\s*&\s*/i).map(s => s.trim()).filter(Boolean);
}

async function extractPdf(buffer) {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0
  });
  try {
    const doc = await task.promise;
    const meta = await doc.getMetadata().catch(() => ({ info: {} }));
    let text = '';
    for (let i = 1; i <= doc.numPages && text.length < MAX_TEXT_CHARS; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str + (item.hasEOL ? '\n' : '')).join('') + '\n\n';
      page.cleanup();
    }
    const truncated = text.length > MAX_TEXT_CHARS;
    return {
      pages: doc.numPages,
      text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text.trim(),
      truncated,
      info: {
        title: String(meta.info?.Title || '').trim(),
        authors: splitAuthorField(meta.info?.Author)
      }
    };
  } finally {
    await task.destroy(); // PDF.js 6: cleanup lives on the loading task
  }
}

module.exports = { extractPdf, looksLikePdf, MAX_TEXT_CHARS };
