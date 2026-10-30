// Search and AI-assistant extras, built from the finished page so they always match it:
//
//   dist/index.html      gets FAQPage structured data (JSON-LD) from the FAQ section
//   dist/llms.txt        a short guide for AI assistants (llmstxt.org): what the site is,
//                        the 1-minute version, every section, and the key primary sources
//   dist/llms-full.txt   the whole guide as Markdown, every citation as a real link
//
// The Markdown comes from the assistant's documents (chat-corpus/, see build-corpus.mjs),
// so run this after it.
//
// Usage: node scripts/build-seo.mjs [dist] [corpus]   (runs after build-corpus)
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { sources } from '../src/data/sources.ts';
import { site } from '../src/data/site.ts';

const distDir = process.argv[2] ?? 'dist';
const corpusDir = process.argv[3] ?? 'chat-corpus';
const fail = (msg) => {
  console.error(`build-seo: ${msg}`);
  process.exit(1);
};

const htmlPath = path.join(distDir, 'index.html');
if (!fs.existsSync(htmlPath)) fail(`${htmlPath} not found. Run astro build first.`);
const html = fs.readFileSync(htmlPath, 'utf8');
const root = parse(html);
const home = root.querySelector('link[rel="canonical"]')?.getAttribute('href');
if (!home) fail('no canonical link on the page');
const clean = (s) => s.replace(/\s+/g, ' ').trim();

// ---------- FAQPage JSON-LD ----------

const faq = root.querySelectorAll('#faq details').map((d) => {
  const q = clean(d.querySelector('summary')?.text ?? '');
  const answer = d.clone();
  answer.querySelector('summary')?.remove();
  for (const cite of answer.querySelectorAll('a.cite')) cite.remove(); // citation pills, not prose
  return { q, a: clean(answer.text) };
});
if (!faq.length || faq.some((f) => !f.q || !f.a)) fail('could not read the FAQ section (#faq details)');
const faqLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  '@id': `${home}#faq`,
  isPartOf: { '@id': `${home}#webpage` },
  inLanguage: 'en-US',
  mainEntity: faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
};
if (html.includes('"@type":"FAQPage"')) fail('FAQPage JSON-LD is already on the page; build from a fresh astro build');
const tag = `<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, '\\u003c')}</script>`;
fs.writeFileSync(htmlPath, html.replace('</head>', `${tag}</head>`));

// ---------- Markdown from the assistant's documents ----------

const manifestPath = path.join(corpusDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) fail(`${manifestPath} not found. Run build-corpus first.`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const sectionTitle = Object.fromEntries(manifest.pages.map((p) => [p.id, p.title]));
const sectionUrl = (id) => (id === 'top' ? home : `${home}#${id}`);
const timestamp = (sec) => `${Math.floor(sec / 3600) ? `${Math.floor(sec / 3600)}:` : ''}${String(Math.floor((sec % 3600) / 60)).padStart(Math.floor(sec / 3600) ? 2 : 1, '0')}:${String(sec % 60).padStart(2, '0')}`;

/** [src:id] / [src:id@seconds] / [page:id] markers -> Markdown links. */
function linkify(text) {
  return text
    .replace(/\[src:([a-z0-9-]+)(?:@(\d+))?\]/g, (m, id, sec) => {
      const s = sources[id];
      if (!s) fail(`unknown source marker ${m}`);
      if (!sec) return `[${s.short}](${s.url})`;
      const url = new URL(s.url);
      url.searchParams.set('t', `${sec}s`); // replaces the source's default start time
      return `[${s.short}, ${timestamp(Number(sec))}](${url})`;
    })
    .replace(/\[page:([a-z0-9-]+)\]/g, (m, id) => {
      if (!sectionTitle[id]) fail(`unknown section marker ${m}`);
      return `[${sectionTitle[id]}](${sectionUrl(id)})`;
    });
}
const docText = (key) => fs.readFileSync(path.join(corpusDir, key), 'utf8');
/** A section document's body, without its heading and its "Page section: …" line. */
const body = (key) =>
  docText(key)
    .split('\n')
    .filter((line, i) => i > 0 && !/^Page section: \[page:[a-z0-9-]+\]\.$/.test(line.trim()))
    .join('\n')
    .trim();

const siteDocs = manifest.docs.filter((d) => d.kind === 'site');
const catalogDocs = manifest.docs.filter((d) => d.kind === 'catalog');
const guideName = 'NH Question 2 and Farmington Schools';
const summary = `A plain-English, fully sourced voter guide to New Hampshire’s Question 2 on the ballot for ${site.electionDate}: the HB 1300 cap on school property-tax growth (RSA 32:5-i), and what it would mean for the Farmington School District (SAU 61).`;
const byline = `Written by ${site.publisher}, a Farmington resident who recommends voting No on Question 2. Supporters’ strongest arguments are included, and every fact links to its source. First published ${site.publishedISO}; last updated ${site.lastUpdated}.`;

// ---------- llms.txt ----------

// Each section's own headline on the page is its one-line summary.
const sectionLines = manifest.pages
  .filter((p) => p.id !== 'top' && p.id !== 'sources')
  .map((p) => {
    const h2 = root.querySelector(`#${p.id} h2`);
    if (!h2) fail(`section #${p.id} has no h2 headline`);
    return `- [${p.title}](${sectionUrl(p.id)}): ${clean(h2.text)}`;
  });
const quickDoc = siteDocs.find((d) => d.section === 'quick');
if (!quickDoc) fail('no "quick" section document');
const keySourceIds = ['rsa-32-5-i', 'hb1300-text', 'hb1300-fiscal-note', 'farmington-sample-ballot', 'school-board-video', 'farmington-results-2026'];
const llms = [
  `# ${guideName}`,
  `> ${summary}`,
  byline,
  `## The 1-minute version\n\n${linkify(body(quickDoc.key))}`,
  `## Sections of the guide\n\n${sectionLines.join('\n')}`,
  `## Full text\n\n- [The whole guide as Markdown](${new URL('/llms-full.txt', home)}): every section, with every citation as a link\n- [The guide on the web](${home})`,
  `## Key primary sources\n\n${keySourceIds.map((id) => `- [${sources[id].title}](${sources[id].url}): ${sources[id].publisher}${sources[id].date ? `, ${sources[id].date}` : ''}`).join('\n')}`,
].join('\n\n');

// ---------- llms-full.txt ----------

let lastSection = null;
const parts = [];
for (const d of siteDocs) {
  if (d.section !== lastSection) {
    parts.push(`## ${sectionTitle[d.section] ?? d.title}\n\nOn the web: ${sectionUrl(d.section)}`);
    lastSection = d.section;
  }
  const heading = docText(d.key).split('\n')[0].replace(/^#\s*/, '');
  const sub = heading.includes(' — ') ? heading.split(' — ').slice(1).join(' — ') : null;
  parts.push(`${sub ? `### ${sub}\n\n` : ''}${linkify(body(d.key))}`);
}
const full = [
  `# ${guideName}`,
  `> ${summary}`,
  `${byline} Canonical page: ${home}`,
  ...parts,
  `## Sources\n\n${catalogDocs.map((d) => `### ${d.title.replace(/^Sources: /, '')}\n\n${linkify(body(d.key).split('\n').filter((l) => l.startsWith('- ')).join('\n'))}`).join('\n\n')}`,
].join('\n\n');

fs.writeFileSync(path.join(distDir, 'llms.txt'), `${llms}\n`);
fs.writeFileSync(path.join(distDir, 'llms-full.txt'), `${full}\n`);
console.log(`SEO: FAQPage with ${faq.length} questions; llms.txt ${Buffer.byteLength(llms)} B; llms-full.txt ${Buffer.byteLength(full)} B`);
