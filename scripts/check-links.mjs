#!/usr/bin/env node
// Fails the build if any outside link in the built site is missing
// target="_blank" or rel="nofollow noopener", or points nowhere.
// Usage: node scripts/check-links.mjs [distDir]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = process.argv[2] || 'dist';
const siteHost = (() => {
  try {
    return new URL(process.env.SITE_URL || 'https://farmington-hb1300.pages.dev').host;
  } catch {
    return '';
  }
})();

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return htmlFiles(p);
    return p.endsWith('.html') ? [p] : [];
  });
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
};

const problems = [];
let external = 0;
const hosts = new Map();

for (const file of htmlFiles(dist)) {
  const html = readFileSync(file, 'utf8');
  const ids = new Set([...html.matchAll(/\sid\s*=\s*"([^"]+)"/g)].map((m) => m[1]));
  for (const [tag] of html.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(tag, 'href');
    const where = `${relative(dist, file)}: ${tag.slice(0, 140)}`;
    if (href === null || href.trim() === '') {
      problems.push(`Link with no href -> ${where}`);
      continue;
    }
    if (href.startsWith('#')) {
      if (href.length > 1 && !ids.has(decodeURIComponent(href.slice(1)))) {
        problems.push(`In-page link to missing id "${href}" -> ${where}`);
      }
      continue;
    }
    if (!/^https?:\/\//i.test(href)) continue;
    const host = new URL(href).host;
    if (host === siteHost) continue;
    external++;
    hosts.set(host, (hosts.get(host) || 0) + 1);
    const target = attr(tag, 'target');
    const rel = (attr(tag, 'rel') || '').toLowerCase().split(/\s+/);
    if (target !== '_blank') problems.push(`Missing target="_blank" -> ${where}`);
    for (const need of ['nofollow', 'noopener']) {
      if (!rel.includes(need)) problems.push(`Missing rel="${need}" -> ${where}`);
    }
  }
}

console.log(`Checked ${external} outside links across ${hosts.size} sites.`);
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('All outside links open in a new window with rel="nofollow noopener".');
