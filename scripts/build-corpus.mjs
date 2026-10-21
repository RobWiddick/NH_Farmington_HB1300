// Builds the documents the "Ask a question" assistant searches (Cloudflare AI Search).
//
//   site--<section>--<nn>-<slug>.md   the page itself, one file per subsection, read
//                                     the way a screen reader would read it
//   primary--<source-id>.md           primary documents from chat/primary/ (the law,
//                                     fiscal note, court records, meeting captions)
//   catalog--<kind>.md                the source list, so it can answer "where does this come from?"
//
// Every citation on the page becomes a marker like [src:hb1300-text] (or
// [src:school-board-video@2241] for a video timestamp). The assistant may only cite
// markers that appear in what it retrieved, and the browser only links ids that
// exist in src/data/sources.ts.
//
// Usage: node scripts/build-corpus.mjs [dist] [out]   (runs after `astro build`)
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parse, NodeType } from 'node-html-parser';
import { sources, kindLabels } from '../src/data/sources.ts';
import { site } from '../src/data/site.ts';
import { pages as chatPages } from '../chat/lib/pages.ts';

const distDir = process.argv[2] ?? 'dist';
const outDir = process.argv[3] ?? 'chat-corpus';
const primaryDir = 'chat/primary';

const MAX_KEY = 128; // AI Search item name limit
const MIN_PART_CHARS = 280; // merge smaller subsections into the one before
const SKIP_SECTIONS = new Set(['sources']); // covered by catalog--*.md
const SKIP_TAGS = new Set(['script', 'style', 'svg', 'nav', 'button', 'form', 'noscript', 'template', 'dialog']);
const SKIP_CLASSES = ['share', 'cta-row', 'chat-only', 'skip', 'kicker', 'legend', 'yr'];
const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'figure', 'figcaption', 'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'table', 'tr', 'h4', 'h5', 'h6', 'details', 'summary', 'aside', 'header', 'footer', 'main',
]);

const fail = (msg) => {
  console.error(`build-corpus: ${msg}`);
  process.exit(1);
};

const htmlPath = path.join(distDir, 'index.html');
if (!fs.existsSync(htmlPath)) fail(`${htmlPath} not found. Run astro build first.`);
const root = parse(fs.readFileSync(htmlPath, 'utf8'));

const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48)
    .replace(/-$/, '');
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const classes = (el) => (el.getAttribute?.('class') ?? '').split(/\s+/);

// ---------- HTML -> markdown-ish text ----------

/** Marker for one <a class="cite">: [src:id] or [src:id@seconds] for a video timestamp. */
function citeMarker(a) {
  const id = a.getAttribute('data-src');
  if (!id || !sources[id]) fail(`citation without a known data-src: ${a.toString().slice(0, 120)}`);
  const href = a.getAttribute('href') ?? '';
  const t = /youtube\.com\/watch\?.*[?&]t=(\d+)s?/.exec(href);
  return t ? `[src:${id}@${t[1]}]` : `[src:${id}]`;
}

class Builder {
  constructor(sectionId, sectionTitle) {
    this.sectionId = sectionId;
    this.sectionTitle = sectionTitle;
    this.parts = [];
    this.newPart(null);
  }
  newPart(title) {
    this.cur = { title, text: '' };
    this.parts.push(this.cur);
  }
  inline(s) {
    if (!s) return;
    const t = this.cur.text;
    const needsSpace = t && !/[\s(“‘[]$/.test(t) && !/^[\s,.;:!?)”’\]]/.test(s);
    this.cur.text += (needsSpace ? ' ' : '') + s;
  }
  block() {
    this.cur.text = this.cur.text.replace(/[ \t]+$/, '');
    if (this.cur.text && !this.cur.text.endsWith('\n\n')) this.cur.text += '\n\n';
  }
  line(s) {
    this.block();
    this.cur.text += s;
    this.block();
  }
}

function tableToText(table, b) {
  const head = table.querySelectorAll('thead th').map((th) => clean(th.text));
  const caption = table.querySelector('caption');
  if (caption) b.line(clean(caption.text));
  for (const tr of table.querySelectorAll('tbody tr, tr')) {
    if (tr.closest('thead')) continue;
    const cells = tr.childNodes.filter((c) => c.nodeType === NodeType.ELEMENT_NODE && /^(td|th)$/i.test(c.tagName));
    if (!cells.length) continue;
    const parts = cells.map((cell, i) => {
      const sub = new Builder('', '');
      walk(cell, sub);
      const v = clean(sub.parts.map((p) => p.text).join(' '));
      const label = cell.getAttribute('data-label') || head[i] || '';
      return label ? `${label}: ${v}` : v;
    });
    b.line(`- ${parts.filter(Boolean).join('; ')}`);
  }
}

function walk(node, b) {
  for (const child of node.childNodes) {
    if (child.nodeType === NodeType.TEXT_NODE) {
      const t = child.text.replace(/\s+/g, ' ');
      if (t.trim()) b.inline(t.trim());
      else if (t && b.cur.text && !/\s$/.test(b.cur.text)) b.cur.text += ' ';
      continue;
    }
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
    const tag = child.tagName.toLowerCase();
    const cls = classes(child);

    if (tag === 'svg' && child.getAttribute('role') === 'img' && child.getAttribute('aria-label')) {
      b.line(`(Chart: ${clean(child.getAttribute('aria-label'))})`);
      continue;
    }
    if (SKIP_TAGS.has(tag) || child.getAttribute('aria-hidden') === 'true' || cls.some((c) => SKIP_CLASSES.includes(c))) continue;
    if (child.hasAttribute?.('hidden')) continue;

    if (tag === 'a' && cls.includes('cite')) {
      b.inline(citeMarker(child));
      continue;
    }
    if (tag === 'h1' || tag === 'h2') continue; // the section title goes in the document header
    if (tag === 'h3') {
      b.newPart(clean(child.text));
      continue;
    }
    if (tag === 'h4' || tag === 'h5') {
      b.line(`#### ${clean(child.text)}`);
      continue;
    }
    if (tag === 'details') {
      const resume = b.cur.title;
      const summary = child.querySelector('summary');
      b.newPart(clean(summary?.text ?? 'More detail'));
      b.cur.isQuestion = b.sectionId === 'faq';
      for (const c of child.childNodes) if (c !== summary) walk({ childNodes: [c] }, b);
      b.newPart(resume);
      continue;
    }
    if (cls.includes('bar-label')) {
      b.line(`- ${child.querySelectorAll('span').map((s) => clean(s.text)).join(': ')}`);
      continue;
    }
    if (tag === 'table') {
      tableToText(child, b);
      continue;
    }
    if (tag === 'li') {
      const sub = new Builder(b.sectionId, '');
      walk(child, sub);
      const t = tidy(sub.parts.map((p) => p.text).join('\n\n')).replace(/\s*\n\n\s*/g, ' ');
      if (t) b.line(`- ${t}`);
      continue;
    }
    if (tag === 'dt') {
      b.block();
      b.cur.text += `- **${clean(child.text)}**:`;
      continue;
    }
    if (tag === 'dd') {
      walk(child, b);
      b.block();
      continue;
    }
    if (tag === 'br') {
      b.cur.text += '\n';
      continue;
    }
    if (tag === 'strong' || tag === 'b') {
      const sub = new Builder('', '');
      walk(child, sub);
      const t = clean(sub.parts.map((p) => p.text).join(' '));
      if (t) b.inline(`**${t}**`);
      continue;
    }
    const isBlock = BLOCK_TAGS.has(tag);
    if (isBlock) b.block();
    walk(child, b);
    if (isBlock) b.block();
  }
}

function tidy(text) {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +([,.;:!?)”’])/g, '$1')
    .replace(/([(“‘]) +/g, '$1')
    .replace(/\*\*\s*\*\*/g, '')
    .replace(/^- \s*$/gm, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// ---------- Build documents ----------

const docs = [];
const add = (doc) => {
  if (doc.key.length > MAX_KEY) fail(`key too long: ${doc.key}`);
  if (docs.some((d) => d.key === doc.key)) fail(`duplicate key: ${doc.key}`);
  docs.push(doc);
};

const guideLine = `From the voter guide "${site.shortTitle}" (${site.publisher ? `written by ${site.publisher}, who` : 'its author'} recommends voting No on Question 2). Last updated ${site.lastUpdated}.`;

const sections = root.querySelectorAll('main section[id]');
if (sections.length < 8) fail(`expected the page's sections, found ${sections.length}`);
const ids = sections.map((s) => s.id).sort().join(',');
if (ids !== Object.keys(chatPages).sort().join(','))
  fail(`chat/lib/pages.ts lists [${Object.keys(chatPages)}] but the page has sections [${sections.map((s) => s.id)}]`);
const pages = [];

for (const section of sections) {
  const id = section.id;
  const kicker = clean(section.querySelector('.kicker')?.text ?? '');
  const h = clean(section.querySelector('h1, h2')?.text ?? id);
  const pageTitle = id === 'top' ? 'Overview' : kicker || h;
  pages.push({ id, title: pageTitle });
  if (SKIP_SECTIONS.has(id)) continue;

  const b = new Builder(id, h);
  walk(section, b);

  // Merge tiny parts into the previous one so each document has enough context.
  const parts = [];
  for (const p of b.parts) {
    p.text = tidy(p.text);
    if (!p.text) continue;
    const prev = parts.at(-1);
    if (prev && p.text.length < MIN_PART_CHARS && !p.isQuestion && p.title === prev.title) {
      prev.text += `\n\n${p.text}`;
    } else if (prev && prev.text.length < MIN_PART_CHARS && !prev.isQuestion && !p.isQuestion) {
      prev.text += `\n\n${p.title ? `### ${p.title}\n\n` : ''}${p.text}`;
    } else {
      parts.push({ ...p });
    }
  }

  parts.forEach((p, i) => {
    const partTitle = p.title && p.title !== h ? p.title : '';
    const title = clean(`${pageTitle}${partTitle ? `: ${partTitle}` : ''}`);
    const heading = p.isQuestion ? `Question: ${partTitle}` : partTitle;
    const body = [
      `# ${pageTitle}${h !== pageTitle ? ` (“${h}”)` : ''}${heading ? ` — ${heading}` : ''}`,
      `${guideLine} Page section: [page:${id}].`,
      p.text,
    ].join('\n\n');
    const n = String(i + 1).padStart(2, '0');
    add({
      key: `site--${id}--${n}-${slug(partTitle || 'main') || 'part'}.md`,
      kind: 'site',
      title,
      section: id,
      source: '',
      body,
    });
  });
}

// Primary documents
for (const file of fs.readdirSync(primaryDir).filter((f) => f.endsWith('.md')).sort()) {
  const id = file.replace(/\.md$/, '');
  const src = sources[id];
  if (!src) fail(`${primaryDir}/${file}: "${id}" is not a source id in src/data/sources.ts`);
  const body = fs.readFileSync(path.join(primaryDir, file), 'utf8').trim();
  if (!body.includes(`[src:${id}`)) fail(`${primaryDir}/${file} should cite itself as [src:${id}]`);
  add({ key: `primary--${id}.md`, kind: 'primary', title: src.title, section: '', source: id, body });
}

// Source catalog, one document per kind
const byKind = new Map();
for (const [id, s] of Object.entries(sources)) {
  if (!byKind.has(s.kind)) byKind.set(s.kind, []);
  byKind.get(s.kind).push([id, s]);
}
for (const [kind, list] of byKind) {
  const lines = list.map(
    ([id, s]) =>
      `- [src:${id}] ${s.title}. ${s.publisher}${s.date ? `, ${s.date}` : ''}.${s.note ? ` ${s.note}` : ''}`,
  );
  add({
    key: `catalog--${kind}.md`,
    kind: 'catalog',
    title: `Sources: ${kindLabels[kind]}`,
    section: 'sources',
    source: '',
    body: [
      `# Sources this guide relies on: ${kindLabels[kind]}`,
      `${guideLine} Page section: [page:sources]. Every fact on the page links to one of these sources. The guide relies first on the law, government data, court records and Farmington's own documents, then on news reporting; groups that take a side are labeled.`,
      ...lines,
    ].join('\n\n'),
  });
}

// ---------- Write ----------

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const manifest = { generated: new Date().toISOString(), pages, docs: [] };
let bad = 0;
for (const d of docs) {
  const body = `${d.body.trim()}\n`;
  for (const m of body.matchAll(/\[src:([a-z0-9-]+)(?:@\d+)?\]/g)) {
    if (!sources[m[1]]) {
      console.error(`build-corpus: ${d.key} cites unknown source "${m[1]}"`);
      bad++;
    }
  }
  if (Buffer.byteLength(body) > 4 * 1024 * 1024) fail(`${d.key} is over 4 MiB`);
  fs.writeFileSync(path.join(outDir, d.key), body);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 32);
  manifest.docs.push({ key: d.key, kind: d.kind, title: d.title.slice(0, 120), section: d.section, source: d.source, hash, bytes: Buffer.byteLength(body) });
}
if (bad) fail(`${bad} unknown source marker(s)`);
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const total = manifest.docs.reduce((n, d) => n + d.bytes, 0);
const count = (k) => manifest.docs.filter((d) => d.kind === k).length;
console.log(
  `Chat corpus: ${manifest.docs.length} documents (${count('site')} page, ${count('primary')} primary, ${count('catalog')} catalog), ${(total / 1024).toFixed(0)} KB -> ${outDir}/`,
);
