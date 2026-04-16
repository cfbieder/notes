import MarkdownIt from 'markdown-it';
import { getAccessToken } from '../api/client.js';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true
});

// Render wikilinks as plain text (no internal links on paper)
const defaultRender = md.renderer.rules.text || function (tokens, idx) {
  return md.utils.escapeHtml(tokens[idx].content);
};

md.renderer.rules.text = function (tokens, idx, options, env, self) {
  // Convert [[Title]] and [[Title|Display]] to just the display text
  let content = tokens[idx].content;
  content = content.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  content = content.replace(/\[\[([^\]]+)\]\]/g, '$1');
  tokens[idx].content = content;
  return defaultRender(tokens, idx, options, env, self);
};

/**
 * Opens a print-friendly window with the note rendered as HTML.
 * The browser's print dialog handles both physical printing and "Save as PDF".
 */
export function printNote(title, markdownContent) {
  const token = getAccessToken();

  // Render markdown to HTML
  let html = md.render(markdownContent || '');

  // Rewrite attachment image URLs to include auth token for the print window
  if (token) {
    html = html.replace(
      /src="(\/api\/v1\/attachments\/[^"]+)"/g,
      (match, url) => {
        const sep = url.includes('?') ? '&' : '?';
        return `src="${url}${sep}token=${encodeURIComponent(token)}"`;
      }
    );
  }

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) return; // popup blocked

  printWindow.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title || 'Untitled')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 14px;
      line-height: 1.7;
      color: #1a1a1a;
      background: #fff;
      padding: 40px 60px;
      max-width: 800px;
      margin: 0 auto;
    }

    .print-title {
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 28px;
      font-weight: 600;
      margin-bottom: 8px;
      color: #111;
    }

    .print-date {
      font-size: 12px;
      color: #888;
      margin-bottom: 28px;
      padding-bottom: 16px;
      border-bottom: 1px solid #ddd;
    }

    h1 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 24px; font-weight: 600; margin: 28px 0 12px; }
    h2 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 20px; font-weight: 600; margin: 24px 0 10px; }
    h3 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 17px; font-weight: 600; margin: 20px 0 8px; }
    h4, h5, h6 { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 15px; font-weight: 600; margin: 16px 0 6px; }

    p { margin: 0 0 12px; }

    a { color: #3a86ff; text-decoration: none; }

    ul, ol { margin: 0 0 12px; padding-left: 24px; }
    li { margin-bottom: 4px; }

    /* Task list checkboxes */
    li {
      list-style: disc;
    }

    blockquote {
      border-left: 3px solid #3a86ff;
      margin: 12px 0;
      padding: 8px 16px;
      color: #555;
      background: #f8f9fa;
    }

    code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      background: #f0f0f0;
      padding: 2px 5px;
      border-radius: 3px;
    }

    pre {
      background: #f5f5f5;
      border: 1px solid #e0e0e0;
      border-radius: 6px;
      padding: 14px 16px;
      margin: 12px 0;
      overflow-x: auto;
    }
    pre code {
      background: none;
      padding: 0;
      font-size: 12px;
      line-height: 1.5;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 8px 10px;
      text-align: left;
    }
    th {
      background: #f5f5f5;
      font-weight: 600;
    }

    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 20px 0;
    }

    img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 8px 0;
    }

    /* Checkbox rendering for task lists */
    input[type="checkbox"] {
      margin-right: 6px;
    }

    @media print {
      body { padding: 0; }
      .print-title { font-size: 24px; }

      a { color: #1a1a1a; }
      a[href]:after { content: none; }

      pre, blockquote { page-break-inside: avoid; }
      h1, h2, h3, h4 { page-break-after: avoid; }
      img { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="print-title">${escapeHtml(title || 'Untitled')}</div>
  <div class="print-date">Printed ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  ${html}
</body>
</html>`);

  printWindow.document.close();

  // Wait for images to load before printing
  const images = printWindow.document.querySelectorAll('img');
  if (images.length === 0) {
    printWindow.focus();
    printWindow.print();
  } else {
    let loaded = 0;
    const total = images.length;
    const onReady = () => {
      loaded++;
      if (loaded >= total) {
        printWindow.focus();
        printWindow.print();
      }
    };
    images.forEach(img => {
      if (img.complete) {
        onReady();
      } else {
        img.addEventListener('load', onReady);
        img.addEventListener('error', onReady);
      }
    });
    // Fallback: print after 5s even if some images haven't loaded
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 5000);
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
