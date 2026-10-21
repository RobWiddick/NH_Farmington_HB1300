// Searches the AI Search instance and turns results into document blocks for
// the answer model. Works with the AI Search Workers binding (env.AI_SEARCH,
// Workers only) or, on Pages, the Workers AI binding's env.AI.autorag().
import type { Chunk, Env } from './types.ts';

export const PER_QUERY = 10;
export const MATCH_THRESHOLD = 0.25;
export const RERANK_MODEL = '@cf/baai/bge-reranker-base';
const MAX_CHUNKS = 8;

export interface SearchOptions {
  /** Results per query (1-50). */
  max: number;
  /** Minimum match score (0-1) that AI Search applies. */
  threshold: number;
  /** AI Search's own reranking. Off by default: it drops everything below a fixed
   *  score, which can leave a plainly answerable question with no results. The
   *  handler reranks the candidates itself instead (see rerank()). */
  rerank: boolean;
  /** Force a request shape for env.AI.autorag().search (testing). */
  shape?: Shape;
}

/** Search settings from env vars (SEARCH_MAX, SEARCH_THRESHOLD, SEARCH_RERANK), with defaults. */
export function searchOptions(env: Env): SearchOptions {
  const n = (v: string | undefined, d: number) => (v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    max: Math.min(50, Math.max(1, n(env.SEARCH_MAX, PER_QUERY))),
    threshold: Math.min(1, Math.max(0, n(env.SEARCH_THRESHOLD, MATCH_THRESHOLD))),
    rerank: env.SEARCH_RERANK === 'true',
  };
}

/** What the last search saw, for the preview test harness. */
export const lastSearch: { shape?: string; raw?: number } = {};
const MAX_PER_DOC = 3;
const MAX_CONTEXT_CHARS = 12_000;

export type Shape = 'legacy-query' | 'legacy-messages';
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

async function searchOnce(env: Env, query: string, opts: SearchOptions = searchOptions(env)): Promise<Chunk[]> {
  const name = env.AI_SEARCH_INSTANCE;
  if (!name) throw new Error('AI_SEARCH_INSTANCE is not set');
  const { max, threshold, rerank } = opts;

  if (env.AI_SEARCH?.get) {
    const res = await env.AI_SEARCH.get(name).search({
      query,
      ai_search_options: {
        retrieval: { max_num_results: max, match_threshold: threshold, keyword_match_mode: 'or' },
        reranking: { enabled: rerank, ...(rerank ? { match_threshold: threshold } : {}) },
      },
    });
    lastSearch.shape = 'binding';
    return normalize(res);
  }

  const autorag = env.AI?.autorag?.(name);
  if (!autorag) throw new Error('No AI Search binding (env.AI_SEARCH or env.AI.autorag)');
  const shapes: Record<Shape, unknown> = {
    'legacy-query': {
      query,
      max_num_results: max,
      rewrite_query: false,
      ranking_options: { score_threshold: threshold },
      reranking: rerank ? { enabled: true, model: '@cf/baai/bge-reranker-base' } : { enabled: false },
    },
    'legacy-messages': {
      messages: [{ role: 'user', content: query }],
      ai_search_options: {
        retrieval: { max_num_results: max, match_threshold: threshold, keyword_match_mode: 'or' },
        reranking: { enabled: rerank, ...(rerank ? { match_threshold: threshold } : {}) },
      },
    },
  };
  // The legacy binding's documented request shape has changed over time; use
  // whichever one this runtime accepts and remember it.
  // On Pages, autorag().search accepts the "query" shape; "messages" is kept as a fallback.
  const order: Shape[] = opts.shape ? [opts.shape] : legacyShape ? [legacyShape] : ['legacy-query', 'legacy-messages'];
  let lastError: unknown;
  for (const shape of order) {
    try {
      const res = await autorag.search(shapes[shape]);
      if (!opts.shape) legacyShape = shape;
      const chunks = normalize(res);
      lastSearch.shape = shape;
      lastSearch.raw = chunks.length;
      return chunks;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Runs every query, then keeps the best distinct chunks within the context budget. */
export async function retrieve(env: Env, queries: string[]): Promise<Chunk[]> {
  return combine(await Promise.allSettled(queries.map((q) => searchOnce(env, q))));
}

/** One search, so the handler can start it before planning finishes. */
export const search = (env: Env, query: string, opts?: SearchOptions) => searchOnce(env, query, opts);

/** Merges several searches' results: the best distinct chunks within the context budget. */
export function combine(settled: PromiseSettledResult<Chunk[]>[]): Chunk[] {
  return select(pool(settled));
}

/** All distinct chunks from several searches, best score first. Throws only if every search failed. */
export function pool(settled: PromiseSettledResult<Chunk[]>[]): Chunk[] {
  const ok = settled.filter((s): s is PromiseFulfilledResult<Chunk[]> => s.status === 'fulfilled');
  if (!ok.length) {
    const reason = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected')?.reason;
    throw reason instanceof Error ? reason : new Error(String(reason));
  }
  const best = new Map<string, Chunk>();
  // AI Search already drops results below its match threshold; scores are only used for ordering here.
  for (const c of ok.flatMap((s) => s.value)) {
    const id = `${c.key}\u0000${c.text.slice(0, 120)}`;
    const prev = best.get(id);
    if (!prev || c.score > prev.score) best.set(id, c);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * Reorders candidates by how well they answer `query`, using the same reranking
 * model AI Search uses, but without a cut-off. Falls back to the search order.
 */
export async function rerank(env: Env, query: string, chunks: Chunk[]): Promise<Chunk[]> {
  if (chunks.length < 2 || !env.AI) return chunks;
  try {
    const out = (await env.AI.run(RERANK_MODEL, {
      query,
      contexts: chunks.map((c) => ({ text: c.text.slice(0, 2000) })),
    })) as { response?: { id?: number; score?: number }[] };
    const ranked = (out?.response ?? [])
      .filter((r) => typeof r.id === 'number' && chunks[r.id] && typeof r.score === 'number')
      .map((r) => ({ ...chunks[r.id as number], score: r.score as number }));
    if (ranked.length !== chunks.length) return chunks;
    return ranked.sort((a, b) => b.score - a.score);
  } catch {
    return chunks;
  }
}

// Documents that argue one side rank high for many questions because they restate
// the law at length. Unless the visitor is asking about them, push them down so
// the guide and the law itself come first.
const DEMOTE: { key: RegExp; unless: RegExp; factor: number }[] = [
  { key: /^primary--bates-complaint\.md$/, unless: /lawsuit|\bsu(e|ed|ing|it)\b|court|judge|complaint|plaintiff|legal challenge|bates|wieser/i, factor: 0.25 },
];

/** Lowers the scores of one-sided documents (see DEMOTE) unless the question is about them. */
export function demote(chunks: Chunk[], text: string): Chunk[] {
  return chunks
    .map((c) => {
      const rule = DEMOTE.find((d) => d.key.test(c.key));
      return rule && !rule.unless.test(text) ? { ...c, score: c.score * rule.factor } : c;
    })
    .sort((a, b) => b.score - a.score);
}

/** The best chunks within the context budget, at most MAX_PER_DOC from one document. */
export function select(ranked: Chunk[]): Chunk[] {
  const perDoc = new Map<string, number>();
  const picked: Chunk[] = [];
  let chars = 0;
  for (const c of ranked) {
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
