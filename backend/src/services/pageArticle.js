// CR039 — "Fetch text": the readable article of a public page as Markdown, for
// a source whose body was never captured. Same pipeline the clipper runs in the
// browser (Mozilla Readability → Turndown), here on a linkedom DOM fed by the
// SSRF-guarded pageFetch. Page scripts never run.
//
// Images are dropped: the Reader would load every remote image, a tracking
// pixel and IP leak for each page; a citation needs the words.

const { parseHTML } = require('linkedom');
const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');
const { fetchPublicPage } = require('../utils/pageFetch');
const { MAX_TEXT_CHARS } = require('./pdfText');

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
// addRule, not remove(): Turndown's built-in image rule outranks remove() (an
// <img> still came out as ![](…)); added rules take precedence over built-ins.
turndown.addRule('dropMedia', {
  filter: ['img', 'picture', 'figure', 'svg', 'video', 'audio', 'iframe', 'script', 'style'],
  replacement: () => ''
});
const MIN_ARTICLE_CHARS = 200; // Readability returns *something* for nearly any page

class ArticleError extends Error {}

function articleFromHtml(html, pageUrl) {
  const { document } = parseHTML(html);
  // Readability resolves relative links against the document's base.
  if (!document.querySelector('base')) {
    const base = document.createElement('base');
    base.setAttribute('href', pageUrl);
    document.head?.appendChild(base);
  }
  const article = new Readability(document).parse();
  if (!article || !article.content || (article.textContent || '').trim().length < MIN_ARTICLE_CHARS) {
    throw new ArticleError('No readable article found on that page');
  }
  let markdown = turndown.turndown(article.content).trim();
  if (markdown.length > MAX_TEXT_CHARS) markdown = markdown.slice(0, MAX_TEXT_CHARS) + '\n\n_(Text truncated.)_';
  return { markdown, title: (article.title || '').trim() };
}

async function articleFromUrl(url) {
  const { html, finalUrl } = await fetchPublicPage(url);
  return { ...articleFromHtml(html, finalUrl), finalUrl };
}

module.exports = { articleFromUrl, articleFromHtml, ArticleError };
