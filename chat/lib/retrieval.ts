// Searches the AI Search instance and turns results into document blocks for
// the answer model. Works with the AI Search Workers binding (env.AI_SEARCH,
// Workers only) or, on Pages, the Workers AI binding's env.AI.autorag().
import type { Chunk, Env } from './types.ts';

export const PER_QUERY = 6;
export const MATCH_THRESHOLD = 0.3;
const MAX_CHUNKS = 8;
const MAX_PER_DOC = 3;
const MAX_CONTEXT_CHARS = 12_000;

type Shape = 'legacy-query' | 'legacy-messages';
let legacyShape: Shape | undefined;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Accepts the new `chunks` response and the legacy `data` response. */
export function normalize(result: unknown): Chunk[] {
  const r = asRecord(result);
  const out: Chunk[] = [];
  if (Array.isArray(r.chunks)) {
    for (const c of r.chunks) {
      const o = asRecord(c);
      const item = asRecord(o.item);
      const key = str(item.key);
      const text = str(o.text);
      if (key && text) out.push({ key, text, score: Number(o.score) || 0, metadata: asRecord(item.metadata) });
    }
  } else if (Array.isArray(r.data)) {
    for (const c of r.data) {
      const o = asRecord(c);
      const key = str(o.filename);
      const content = Array.isArray(o.content) ? o.content : [];
      const text = content.map((p) => str(asRecord(p).text)).join('\n');
      if (key && text) out.push({ key, text, score: Number(o.score) || 0, metadata: asRecord(o.attributes) });
    }
  }
  return out;
}

async function searchOnce(env: Env, query: string): Promise<Chunk[]> {
  const name = env.AI_SEARCH_INSTANCE;
  if (!name) throw new Error('AI_SEARCH_INSTANCE is not set');

  if (env.AI_SEARCH?.get) {
    const res = await env.AI_SEARCH.get(name).search({
      query,
      ai_search_options: {
        retrieval: { max_num_results: PER_QUERY, match_threshold: MATCH_THRESHOLD, keyword_match_mode: 'or' },
        reranking: { enabled: true },
      },
    });
    return normalize(res);
  }

  const autorag = env.AI?.autorag?.(name);
  if (!autorag) throw new Error('No AI Search binding (env.AI_SEARCH or env.AI.autorag)');
  const shapes: Record<Shape, unknown> = {
    'legacy-query': {
      query,
      max_num_results: PER_QUERY,
      rewrite_query: false,
      ranking_options: { score_threshold: MATCH_THRESHOLD },
      reranking: { enabled: true, model: '@cf/baai/bge-reranker-base' },
    },
    'legacy-messages': {
      messages: [{ role: 'user', content: query }],
      ai_search_options: {
        retrieval: { max_num_results: PER_QUERY, match_threshold: MATCH_THRESHOLD },
        reranking: { enabled: true },
      },
    },
  };
  // The legacy binding's documented request shape has changed over time; use
  // whichever one this runtime accepts and remember it.
  const order: Shape[] = legacyShape ? [legacyShape] : ['legacy-query', 'legacy-messages'];
  let lastError: unknown;
  for (const shape of order) {
    try {
      const res = await autorag.search(shapes[shape]);
      legacyShape = shape;
      return normalize(res);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Runs every query, then keeps the best distinct chunks within the context budget. */
export async function retrieve(env: Env, queries: string[]): Promise<Chunk[]> {
  const settled = await Promise.allSettled(queries.map((q) => searchOnce(env, q)));
  const ok = settled.filter((s): s is PromiseFulfilledResult<Chunk[]> => s.status === 'fulfilled');
  if (!ok.length) {
    const reason = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected')?.reason;
    throw reason instanceof Error ? reason : new Error(String(reason));
  }
  const best = new Map<string, Chunk>();
  // AI Search already drops results below MATCH_THRESHOLD; scores are only used for ordering here.
  for (const c of ok.flatMap((s) => s.value)) {
    const id = `${c.key}\u0000${c.text.slice(0, 120)}`;
    const prev = best.get(id);
    if (!prev || c.score > prev.score) best.set(id, c);
  }
  const perDoc = new Map<string, number>();
  const picked: Chunk[] = [];
  let chars = 0;
  for (const c of [...best.values()].sort((a, b) => b.score - a.score)) {
    if (picked.length >= MAX_CHUNKS) break;
    const n = perDoc.get(c.key) ?? 0;
    if (n >= MAX_PER_DOC || chars + c.text.length > MAX_CONTEXT_CHARS) continue;
    perDoc.set(c.key, n + 1);
    picked.push(c);
    chars += c.text.length;
  }
  return picked;
}

export interface DocInfo {
  kind: 'site' | 'primary' | 'catalog' | 'other';
  section: string;
  source: string;
}

/** Item keys are written by scripts/build-corpus.mjs: site--<section>--…, primary--<source>.md, catalog--<kind>.md */
export function docInfo(key: string): DocInfo {
  const base = key.replace(/^.*\//, '').replace(/\.md$/, '');
  const [kind, a = ''] = base.split('--');
  if (kind === 'site') return { kind, section: a, source: '' };
  if (kind === 'primary') return { kind, section: '', source: a };
  if (kind === 'catalog') return { kind, section: 'sources', source: '' };
  return { kind: 'other', section: '', source: '' };
}
