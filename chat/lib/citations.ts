// Turns retrieved chunks into the documents the answer model sees, and works
// out which citations it may use. The browser receives the same allowlist and
// links nothing else, so an answer can only point to sources in
// src/data/sources.ts or to sections of this page.
import { sources, type SourceId } from '../../src/data/sources.ts';
import { pages } from './pages.ts';
import { docInfo } from './retrieval.ts';
import type { Chunk } from './types.ts';

import { MARKER } from './markers.ts';

export { MARKER };

export interface MetaSource {
  id: string;
  short: string;
  title: string;
  publisher: string;
  date?: string;
  url: string;
  kind: string;
  /** A YouTube link that the browser can deep-link with a timestamp. */
  video: boolean;
}

export interface Meta {
  status: 'answer' | 'no_match' | 'off_topic' | 'greeting';
  sources: MetaSource[];
  pages: { id: string; title: string }[];
  /** Only in CHAT_EVAL mode: model, queries, timings and retrieved chunks. */
  debug?: Record<string, unknown>;
}

const isSource = (id: string): id is SourceId => Object.prototype.hasOwnProperty.call(sources, id);
const isPage = (id: string) => Object.prototype.hasOwnProperty.call(pages, id);

export function sourceMeta(id: string): MetaSource | undefined {
  if (!isSource(id)) return undefined;
  const s = sources[id];
  return {
    id,
    short: s.short,
    title: s.title,
    publisher: s.publisher,
    date: 'date' in s ? (s.date as string) : undefined,
    url: s.url,
    kind: s.kind,
    video: /^https:\/\/(www\.)?youtube\.com\/watch\?/.test(s.url),
  };
}

export function pageMeta(ids: Iterable<string>) {
  return [...new Set(ids)].filter(isPage).map((id) => ({ id, title: pages[id] }));
}

const attr = (s: string) => s.replace(/["<>\n]/g, ' ').replace(/\s+/g, ' ').trim();

// Shown to the answer model on every passage from these documents, because a
// passage cut from the middle loses the document's own header.
const CAUTIONS: Record<string, string> = {
  'bates-complaint': 'A lawsuit filing: one side’s allegations, not findings. The court denied the request to block the question.',
  'school-board-video': 'Machine-generated captions of a public meeting; they don’t say who is speaking.',
  'school-board-video-0914': 'Machine-generated captions of a public meeting; they don’t say who is speaking.',
};
const SITE_NOTE = 'Written by the guide’s author, who recommends voting No. “I” and “my” in this text mean the author.';

export function buildContext(chunks: Chunk[]) {
  const groups = new Map<string, { title: string; type: string; note: string; texts: string[] }>();
  const srcIds = new Set<string>();
  const pageIds = new Set<string>();
  const markers = new Set<string>();

  for (const c of chunks) {
    const info = docInfo(c.key);
    for (const m of c.text.matchAll(MARKER)) {
      if (m[1] === 'src' && isSource(m[2])) {
        srcIds.add(m[2]);
        markers.add(m[0]);
      } else if (m[1] === 'page' && isPage(m[2])) {
        pageIds.add(m[2]);
        markers.add(m[0]);
      }
    }
    if (info.source && isSource(info.source)) {
      srcIds.add(info.source);
      markers.add(`[src:${info.source}]`);
    }
    if (info.section && isPage(info.section)) {
      pageIds.add(info.section);
      markers.add(`[page:${info.section}]`);
    }

    let g = groups.get(c.key);
    if (!g) {
      const metaTitle = typeof c.metadata.title === 'string' ? c.metadata.title : '';
      const fallback =
        info.kind === 'primary' && isSource(info.source)
          ? sources[info.source].title
          : info.section && isPage(info.section)
            ? pages[info.section]
            : c.key;
      const type =
        info.kind === 'site'
          ? 'this guide'
          : info.kind === 'primary'
            ? 'primary document'
            : info.kind === 'catalog'
              ? 'source list'
              : 'document';
      const note = info.kind === 'site' ? SITE_NOTE : CAUTIONS[info.source] ?? '';
      g = { title: metaTitle || fallback, type, note, texts: [] };
      groups.set(c.key, g);
    }
    g.texts.push(c.text.trim());
  }

  const docsText = [...groups.values()]
    .map((g) => `<document type="${g.type}" title="${attr(g.title)}"${g.note ? ` note="${attr(g.note)}"` : ''}>\n${g.texts.join('\n[…]\n')}\n</document>`)
    .join('\n\n');

  return {
    docsText,
    markers: [...markers],
    sources: [...srcIds].map(sourceMeta).filter((s): s is MetaSource => !!s),
    pages: pageMeta(pageIds),
  };
}

/** Removes citation markers, e.g. from earlier answers sent back as history. */
export const stripMarkers = (s: string) => s.replace(MARKER, '').replace(/\s{2,}/g, ' ').trim();
