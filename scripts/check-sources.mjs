#!/usr/bin/env node
// Keeps the sources list honest: fails if a source in src/data/sources.ts is
// never cited on the page, or if a page cites an id that doesn't exist.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const registry = readFileSync('src/data/sources.ts', 'utf8');
const body = registry.slice(registry.indexOf('defineSources({'));
const ids = [...body.matchAll(/^\s{2}'([a-z0-9-]+)':\s*\{/gm)].map((m) => m[1]);

const files = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.astro') ? [p] : [];
  });

const cited = new Set();
for (const f of files('src')) {
  for (const m of readFileSync(f, 'utf8').matchAll(/<Cite\s+id="([^"]+)"/g)) cited.add(m[1]);
}

const unused = ids.filter((id) => !cited.has(id));
const unknown = [...cited].filter((id) => !ids.includes(id));
if (unknown.length) console.error(`Cited but not defined: ${unknown.join(', ')}`);
if (unused.length) console.error(`Defined but never cited (remove or cite): ${unused.join(', ')}`);
if (unknown.length || unused.length) process.exit(1);
console.log(`All ${ids.length} sources are cited on the page.`);
