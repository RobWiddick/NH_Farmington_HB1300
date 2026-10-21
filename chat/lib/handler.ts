// POST /api/chat: the "Ask a question" assistant.
//
// Each question runs a small agent loop:
//   1. plan      a fast model turns the conversation into 1-3 standalone search
//                queries (and spots greetings and off-topic requests)
//   2. retrieve  every query runs against Cloudflare AI Search (hybrid search +
//                reranking); the best distinct chunks are kept
//   3. gate      no supporting documents -> a fixed "couldn't find that" reply;
//                the answer model is never asked to answer from memory
//   4. answer    the answer model writes a short reply that cites the retrieved
//                documents with [src:id] / [page:id] markers, streamed back
//
// The response is a Server-Sent Events stream: one `meta` event (status plus the
// citation allowlist, built from sources.ts), then the model's own SSE stream
// passed through untouched, ending with `data: [DONE]`.
import { buildContext, pageMeta, stripMarkers, type Meta } from './citations.ts';
import { CANNED, PLANNER_PROMPT, answerPrompt } from './prompts.ts';
import { demote, lastSearch, pool, rerank, search, searchOptions, select } from './retrieval.ts';
import type { ChatMessage, Env } from './types.ts';

// Chosen by grading the full 39-question test battery against live answers
// (Workers Paid, Oct. 2026). Average grades out of 5 for accuracy / citations /
// following the rules, and speed and cost per answer:
//   DeepSeek V4.1 Flash, reasoning off  4.8 / 4.8 / 4.8   4.6s median   ~90 neurons
//   GLM 5.3 Flash, reasoning low        4.8 / 4.7 / 4.7  11.8s median   ~50 neurons
//   GPT-OSS 120B, reasoning low         3.5 / 3.5 / 3.6   5.8s median  ~130 neurons
export const DEFAULT_CHAT_MODEL = '@cf/deepseek-ai/deepseek-v4.1-flash-1017';
// Used when the answer model errors (for example Workers AI's per-minute model
// limit): as accurate, just slower.
export const FALLBACK_CHAT_MODEL = '@cf/zai-org/glm-5.3-flash';
export const DEFAULT_PLANNER_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';

// Models that CHAT_EVAL mode lets a request pick with the x-chat-model header.
const EVAL_MODELS = new Set([
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/deepseek-ai/deepseek-v4.1-flash-1017',
  '@cf/openai/gpt-oss-120b',
  '@cf/zai-org/glm-5.3-flash',
  '@cf/google/gemma-4-26b-a4b-it',
  '@cf/qwen/qwen3.8-27b',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fast',
]);

// How much longer to wait for a cut-short planner before a "not found" reply.
const LATE_PLAN_MS = 3000;

/** Reasoning setting per model: short thinking where it helps, off where it only adds delay. */
export function defaultEffort(model: string): string {
  if (model.includes('deepseek-v4')) return 'none';
  if (model.includes('gpt-oss') || model.includes('glm-5')) return 'low';
  return '';
}

export const LIMITS = {
  bodyBytes: 16_000,
  messages: 12,
  historyUsed: 6,
  userChars: 500,
  assistantChars: 1_500,
  answerTokens: 650,
  perMinute: 8,
  perHour: 40,
};

const GREETING = /^(hi|hello|hey|hiya|howdy|thanks|thank you|thx|good (morning|afternoon|evening)|bye|goodbye)\b[\s!.,]*(there|so much|again)?[\s!.]*$/i;

const ON_TOPIC_HINT =
  /\b(tax|taxes|levy|cap|caps|school|schools|budget|farmington|question\s*2|hb\s*1300|rsa|ballot|vote|voting|sau|teacher|inflation|override|60%|default|town|district|lawsuit|court|ankarberg|innis|berry|supporters?|opponents?|source|sources)\b/i;

// Extra searches for two kinds of first question that need more than the
// question's own wording finds. The planner writes these queries too, but it
// often finishes after the first search has to start (see PLAN_TIMEOUT_MS), so
// these run alongside the first search. The reranker drops what doesn't help.
const QUERY_HINTS: { test: RegExp; queries: string[] }[] = [
  {
    // Only general questions about the whole measure: "What does Question 2 do?",
    // "Explain HB 1300", "What is this ballot question about?". Not "What inflation
    // number does the cap use?", which the question's own wording finds.
    test: /^\s*(?:what(?:'s|’s|\s+is|\s+does|\s+would|\s+will)?|explain|summari[sz]e|tell me about|give me (?:an? )?(?:overview|summary) of|can you (?:explain|summari[sz]e))\s+(?:(?:this|the)\s+)?(?:question\s*2|q2|hb\s*1300|rsa\s*32:5-i|(?:school\s+|tax\s+|school\s+tax\s+)?cap|law|bill|measure|ballot question)(?:\s+(?:actually|really|exactly))?(?:\s+(?:do|mean|about|say|for farmington|in plain english))*\s*[?.!]*\s*$/i,
    queries: ['plain-English summary of what Question 2 does: the school levy cap, the 6% central office cap and the 60% vote'],
  },
  {
    // "How should I vote?", "What's the best argument for Yes?", "What do supporters say?"
    test: /\b(how (?:should|do|would) i vote|should i vote|vote (?:yes|no) on|(?:best|strongest|main) (?:argument|case|reason)s?|pros and cons|arguments? (?:for|against)|why (?:vote|would anyone|should anyone|do people)|good idea|bad idea|worth (?:it|voting)|what do (?:supporters|opponents|critics)\b)/i,
    queries: ["the guide author's reasons to vote No on Question 2", "supporters' strongest arguments for the school tax cap"],
  },
];

/** Extra search queries for a first question (see QUERY_HINTS). */
export function hintQueries(question: string): string[] {
  return QUERY_HINTS.filter((h) => h.test.test(question)).flatMap((h) => h.queries);
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });

// ---------- Abuse limits ----------

// Best-effort, per-isolate limiter. For a hard limit, add a Cloudflare WAF rate
// limiting rule on /api/chat (see README).
const hits = new Map<string, number[]>();
export function rateLimited(ip: string, now = Date.now(), perMinute = LIMITS.perMinute, perHour = LIMITS.perHour): number {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  const lastMinute = recent.filter((t) => now - t < 60_000);
  let retryAfter = 0;
  if (lastMinute.length >= perMinute) retryAfter = Math.ceil((60_000 - (now - lastMinute[0])) / 1000);
  else if (recent.length >= perHour) retryAfter = Math.ceil((3_600_000 - (now - recent[0])) / 1000);
  if (!retryAfter) recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 3_600_000) hits.delete(k);
  return retryAfter;
}

export function parseMessages(body: unknown): ChatMessage[] | string {
  const raw = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(raw) || !raw.length) return 'messages must be a non-empty array';
  const msgs: ChatMessage[] = [];
  for (const m of raw.slice(-LIMITS.messages)) {
    const role = (m as { role?: unknown })?.role;
    const content = (m as { content?: unknown })?.content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return 'each message needs a role of user or assistant and text content';
    const text = content.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const max = role === 'user' ? LIMITS.userChars : LIMITS.assistantChars;
    if (role === 'user' && text.length > max && m === raw[raw.length - 1]) return `questions can be up to ${max} characters`;
    msgs.push({ role, content: text.slice(0, max) });
  }
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return 'the last message must be the question';
  return msgs;
}

// ---------- Agent steps ----------

interface Plan {
  scope: 'on_topic' | 'off_topic' | 'greeting';
  queries: string[];
  /** The planner was too slow, so the question is searched as asked. */
  timedOut?: boolean;
}

function modelText(out: unknown): string {
  const o = out as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  if (typeof o?.response === 'string') return o.response;
  if (o?.response && typeof o.response === 'object') return JSON.stringify(o.response);
  const c = o?.choices?.[0]?.message?.content;
  return typeof c === 'string' ? c : '';
}

export async function plan(env: Env, history: ChatMessage[], question: string, model = env.PLANNER_MODEL || DEFAULT_PLANNER_MODEL): Promise<Plan> {
  const fallback: Plan = { scope: 'on_topic', queries: [question] };
  try {
    const convo = history
      .map((m) => `${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${stripMarkers(m.content).slice(0, 300)}`)
      .join('\n');
    const effort = defaultEffort(model);
    const out = await env.AI!.run(model, {
      messages: [
        { role: 'system', content: PLANNER_PROMPT },
        {
          role: 'user',
          content: `${convo ? `Conversation so far:\n${convo}\n\n` : ''}Latest message:\n${question}`,
        },
      ],
      max_tokens: 160,
      temperature: 0,
      ...(effort ? { reasoning_effort: effort } : {}),
    });
    const text = modelText(out);
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as Partial<Plan>;
    const scope = parsed.scope === 'off_topic' || parsed.scope === 'greeting' ? parsed.scope : 'on_topic';
    const planned = Array.isArray(parsed.queries)
      ? parsed.queries.filter((q): q is string => typeof q === 'string' && !!q.trim()).map((q) => q.trim().slice(0, 200))
      : [];
    // Never refuse a question that plainly mentions the subject.
    if (scope !== 'on_topic' && ON_TOPIC_HINT.test(question)) return { scope: 'on_topic', queries: [question, ...planned].slice(0, 3) };
    const queries = [...new Set([...planned, question])].slice(0, 3);
    return { scope, queries };
  } catch {
    return fallback;
  }
}

// ---------- Streaming ----------

const enc = new TextEncoder();
const sse = (event: string | null, data: unknown) =>
  `${event ? `event: ${event}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

/** A fixed reply, in the same stream format as a model answer. */
function cannedStream(meta: Meta, text: string): Response {
  const body = sse('meta', meta) + sse(null, { response: text }) + sse(null, '[DONE]');
  return new Response(body, { headers: SSE_HEADERS });
}

type Waiter = { waitUntil?(p: Promise<unknown>): void };

function relay(meta: Meta, model: ReadableStream, ctx?: Waiter): Response {
  // IdentityTransformStream (Workers) lets pipeTo run natively, so relaying the
  // model's stream costs almost no CPU time.
  const Identity = (globalThis as { IdentityTransformStream?: new () => TransformStream }).IdentityTransformStream;
  const { readable, writable } = Identity ? new Identity() : new TransformStream();
  const done = (async () => {
    const writer = writable.getWriter();
    await writer.write(enc.encode(sse('meta', meta)));
    writer.releaseLock();
    await model.pipeTo(writable);
  })().catch((err) => console.error('chat stream error', String(err)));
  ctx?.waitUntil?.(done);
  return new Response(readable, { headers: SSE_HEADERS });
}

// ---------- Handler ----------

export async function handleChat(request: Request, env: Env, ctx?: Waiter): Promise<Response> {
  const started = Date.now();
  const log = (status: string, extra: Record<string, unknown> = {}) =>
    console.log(JSON.stringify({ event: 'chat', status, ms: Date.now() - started, ...extra }));

  if (request.method !== 'POST') return json(405, { error: 'Use POST.' }, { allow: 'POST' });
  if (env.CHAT_ENABLED === 'false') return json(503, { error: 'The assistant is switched off.' });

  // Same-origin only: the widget on this site, not other sites or scripts.
  const origin = request.headers.get('origin');
  let sameOrigin = false;
  try {
    sameOrigin = !!origin && new URL(origin).host === new URL(request.url).host;
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) return json(403, { error: 'Requests must come from this site.' });

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const limit = (v: string | undefined, fallback: number) => (Number(v) > 0 ? Number(v) : fallback);
  const wait = rateLimited(ip, Date.now(), limit(env.RATE_PER_MINUTE, LIMITS.perMinute), limit(env.RATE_PER_HOUR, LIMITS.perHour));
  if (wait) {
    log('rate_limited');
    return json(429, { error: 'Too many questions in a short time. Please wait a minute.' }, { 'retry-after': String(wait) });
  }

  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json(415, { error: 'Send JSON.' });
  const raw = await request.text();
  if (raw.length > LIMITS.bodyBytes) return json(413, { error: 'That conversation is too long. Start a new one.' });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Invalid JSON.' });
  }
  const msgs = parseMessages(body);
  if (typeof msgs === 'string') return json(400, { error: msgs });

  if (!env.AI) return json(503, { error: 'The assistant isn’t set up yet.' });

  const question = msgs[msgs.length - 1].content;
  const history = msgs.slice(0, -1).slice(-LIMITS.historyUsed);

  // CHAT_EVAL (preview deployments only) lets a test harness pick the answer
  // model and get timings and retrieval details back in the meta event.
  const evalMode = env.CHAT_EVAL === 'true';
  let model = env.CHAT_MODEL || DEFAULT_CHAT_MODEL;
  let effort = env.CHAT_REASONING ?? defaultEffort(model);
  if (evalMode) {
    const m = request.headers.get('x-chat-model');
    if (m && EVAL_MODELS.has(m)) {
      model = m;
      effort = defaultEffort(model);
    }
    const e = request.headers.get('x-reasoning-effort');
    if (e !== null && /^(|none|low|medium|high)$/.test(e)) effort = e;
  }
  const sOpts = searchOptions(env);
  if (evalMode) {
    const t = Number(request.headers.get('x-search-threshold') ?? NaN);
    if (t >= 0 && t <= 1) sOpts.threshold = t;
    const mx = Number(request.headers.get('x-search-max') ?? NaN);
    if (mx >= 1 && mx <= 50) sOpts.max = mx;
    const rr = request.headers.get('x-search-rerank');
    if (rr === 'on' || rr === 'off') sOpts.rerank = rr === 'on';
    const sh = request.headers.get('x-search-shape');
    if (sh === 'legacy-query' || sh === 'legacy-messages') sOpts.shape = sh;
  }
  let selfRerank = env.SELF_RERANK !== 'false';
  if (evalMode) {
    const sr = request.headers.get('x-self-rerank');
    if (sr === 'on' || sr === 'off') selfRerank = sr === 'on';
  }

  let plannerModel = env.PLANNER_MODEL || DEFAULT_PLANNER_MODEL;
  let planTimeout = Number(env.PLAN_TIMEOUT_MS) > 0 ? Number(env.PLAN_TIMEOUT_MS) : 1500;
  if (evalMode) {
    const pm = request.headers.get('x-planner-model');
    if (pm && EVAL_MODELS.has(pm)) plannerModel = pm;
    const pt = Number(request.headers.get('x-plan-timeout'));
    if (pt > 0 && pt <= 20_000) planTimeout = pt;
  }

  // PLAN_MODE "followups" skips the planner for a first question (saving a model
  // call): the question is searched as asked, and the answer model's rules handle
  // off-topic requests. Follow-ups always need the planner to resolve "it"/"that".
  let planMode = env.PLAN_MODE === 'followups' ? 'followups' : 'always';
  if (evalMode) {
    const pm = request.headers.get('x-plan');
    if (pm === 'always' || pm === 'followups') planMode = pm;
  }

  // Search the question as asked (plus any hint queries for a first question)
  // while the planner works out better queries.
  const hints = history.length ? [] : hintQueries(question);
  const firstSearches = [question, ...hints].map((q) => search(env, q, sOpts));
  firstSearches.forEach((s) => s.catch(() => {})); // handled below; avoids an unhandled rejection if we return early
  // A first question doesn't need the planner to make sense, so don't let a slow
  // planner hold it up: after PLAN_TIMEOUT_MS, go ahead with the question as asked.
  const asAsked: Plan = GREETING.test(question) ? { scope: 'greeting', queries: [] } : { scope: 'on_topic', queries: [question] };
  const planning = planMode === 'followups' && !history.length ? null : plan(env, history, question, plannerModel);
  const p: Plan = !planning
    ? asAsked
    : history.length
      ? await planning
      : await Promise.race([planning, new Promise<Plan>((r) => setTimeout(() => r({ ...asAsked, timedOut: true }), planTimeout))]);
  const planMs = Date.now() - started;
  if (p.scope === 'greeting') {
    log('greeting');
    return cannedStream({ status: 'greeting', sources: [], pages: [] }, CANNED.greeting);
  }
  if (p.scope === 'off_topic') {
    log('off_topic');
    return cannedStream({ status: 'off_topic', sources: [], pages: [] }, CANNED.offTopic);
  }

  let chunks;
  try {
    const searched = new Set([question, ...hints].map((q) => q.toLowerCase()));
    const more = p.queries.filter((q) => !searched.has(q.toLowerCase())).map((q) => search(env, q, sOpts));
    let candidates = pool(await Promise.allSettled([...firstSearches, ...more]));
    // AI Search occasionally returns nothing for a query it answers fine a moment
    // later; retry (twice, briefly spaced) before telling the visitor nothing was found.
    for (const wait of [300, 1000]) {
      if (candidates.length) break;
      await new Promise((r) => setTimeout(r, wait));
      candidates = pool(await Promise.allSettled([...new Set([...p.queries, ...hints])].map((q) => search(env, q, sOpts))));
    }
    // Rerank against the planner's standalone version of the question, so a
    // follow-up like "and Dover?" is scored as "Dover tax cap ...".
    const ranked = selfRerank ? await rerank(env, p.queries[0] || question, candidates) : candidates;
    chunks = select(demote(ranked, `${question} ${p.queries.join(' ')}`));
  } catch (err) {
    log('search_error', { error: String(err).slice(0, 200) });
    return json(503, { error: 'The assistant can’t reach its sources right now.', ...(evalMode ? { detail: String(err).slice(0, 300) } : {}) });
  }
  if (evalMode && request.headers.get('x-search-only') === '1') {
    return json(200, {
      queries: p.queries,
      scope: p.scope,
      planTimedOut: !!p.timedOut,
      plannerModel,
      planMs,
      searchMs: Date.now() - started - planMs,
      search: sOpts,
      lastSearch: { ...lastSearch },
      chunks: chunks.map((c) => ({ key: c.key, score: c.score, text: c.text.slice(0, 160) })),
    });
  }
  if (!chunks.length) {
    // Nothing found. If the planner was cut short, give it a little longer: an
    // off-topic request ("write me a poem") deserves the off-topic reply, not
    // "I couldn't find that".
    if (p.timedOut && planning) {
      const late = await Promise.race([planning, new Promise<null>((r) => setTimeout(() => r(null), LATE_PLAN_MS))]);
      if (late?.scope === 'off_topic') {
        log('off_topic', { latePlan: true });
        return cannedStream({ status: 'off_topic', sources: [], pages: [] }, CANNED.offTopic);
      }
    }
    log('no_match', { queries: p.queries.length });
    const meta: Meta = { status: 'no_match', sources: [], pages: pageMeta(['sources']) };
    if (evalMode) meta.debug = { queries: p.queries, planMs, search: sOpts, lastSearch: { ...lastSearch } };
    return cannedStream(meta, CANNED.noMatch);
  }

  const ctxDocs = buildContext(chunks);
  const today = new Date().toISOString().slice(0, 10);
  const messages = [
    { role: 'system', content: answerPrompt(today) },
    ...history.map((m) => ({ role: m.role, content: m.role === 'assistant' ? stripMarkers(m.content) : m.content })),
    {
      role: 'user',
      content: `Documents for this question:\n\n${ctxDocs.docsText}\n\nAllowed citation markers: ${ctxDocs.markers.join(' ')}\n\nVisitor's question: ${question}`,
    },
  ];

  const searchMs = Date.now() - started - planMs;
  const runModel = (m: string, e: string) =>
    env.AI!.run(m, {
      messages,
      stream: true,
      max_tokens: LIMITS.answerTokens,
      temperature: 0.2,
      // Only for models with a reasoning setting (e.g. "none" turns it off on DeepSeek V4).
      ...(e ? { reasoning_effort: e } : {}),
    });
  let stream: unknown;
  try {
    stream = await runModel(model, effort);
  } catch (err) {
    // A model can be briefly rate-limited or unavailable; answer with the fallback
    // model rather than an error.
    const fallback = env.FALLBACK_MODEL ?? FALLBACK_CHAT_MODEL;
    log('model_error', { model, fallback, error: String(err).slice(0, 200) });
    try {
      if (!fallback || fallback === model) throw err;
      stream = await runModel(fallback, defaultEffort(fallback));
      model = fallback;
    } catch (err2) {
      return json(503, { error: 'The assistant is busy right now. Please try again in a moment.', ...(evalMode ? { detail: String(err2).slice(0, 300) } : {}) });
    }
  }
  if (!(stream instanceof ReadableStream)) {
    log('model_error', { error: 'no stream' });
    return json(503, { error: 'The assistant is busy right now. Please try again in a moment.' });
  }

  log('answer', { model, queries: p.queries.length, chunks: chunks.length, sources: ctxDocs.sources.length, planMs, searchMs });
  const meta: Meta = { status: 'answer', sources: ctxDocs.sources, pages: ctxDocs.pages };
  if (evalMode)
    meta.debug = { model, effort, planMode, planTimedOut: !!p.timedOut, selfRerank, queries: p.queries, hints, planMs, searchMs, search: sOpts, lastSearch: { ...lastSearch }, chunks: chunks.map((c) => ({ key: c.key, score: c.score })) };
  return relay(meta, stream, ctx);
}
