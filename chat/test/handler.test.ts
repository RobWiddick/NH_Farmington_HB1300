// Tests for the chat agent with fake Cloudflare bindings. Run: npm run test:chat
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildContext } from '../lib/citations.ts';
import { handleChat, hintQueries, parseMessages, plan, rateLimited } from '../lib/handler.ts';
import { normalize } from '../lib/retrieval.ts';
import type { Env } from '../lib/types.ts';

const enc = new TextEncoder();
const streamOf = (parts: string[]) =>
  new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(p));
      c.close();
    },
  });

const legacyResult = (items: { key: string; text: string; score?: number }[]) => ({
  object: 'vector_store.search_results.page',
  data: items.map((i) => ({ file_id: i.key, filename: i.key, score: i.score ?? 0.8, attributes: {}, content: [{ type: 'text', text: i.text }] })),
});

function fakeEnv(opts: { plan?: unknown; search?: () => unknown; answer?: string[]; calls?: unknown[] } = {}): Env {
  return {
    AI_SEARCH_INSTANCE: 'test-instance',
    AI: {
      async run(model: string, input: unknown) {
        opts.calls?.push({ model, input });
        const i = input as { stream?: boolean };
        if (i.stream) return streamOf(opts.answer ?? ['data: {"response":"It limits the levy. [src:rsa-32-5-i]"}\n\n', 'data: [DONE]\n\n']);
        return { response: JSON.stringify(opts.plan ?? { scope: 'on_topic', queries: ['what does question 2 do'] }) };
      },
      autorag: () => ({
        search: async () =>
          opts.search
            ? opts.search()
            : legacyResult([
                { key: 'site--ballot--01-main.md', text: 'The cap covers the whole levy. [src:rsa-32-5-i] [src:not-a-real-source]' },
                { key: 'primary--hb1300-text.md', text: 'VIII.(a) The maximum allowable levy shall equal...' },
              ]),
      }),
    },
  };
}

let ipCounter = 0;
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://farmington-hb1300.pages.dev/api/chat', {
    method: 'POST',
    headers: {
      origin: 'https://farmington-hb1300.pages.dev',
      'content-type': 'application/json',
      'cf-connecting-ip': `10.0.0.${++ipCounter}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });

const ask = (q: string) => ({ messages: [{ role: 'user', content: q }] });

async function readEvents(res: Response) {
  const text = await res.text();
  const meta = /event: meta\ndata: (.*)\n/.exec(text);
  const data = [...text.matchAll(/^data: (.*)$/gm)].map((m) => m[1]).filter((d) => d !== meta?.[1]);
  return { text, meta: meta ? JSON.parse(meta[1]) : null, data };
}

test('parseMessages validates and trims the conversation', () => {
  assert.equal(typeof parseMessages({}), 'string');
  assert.equal(typeof parseMessages({ messages: [{ role: 'system', content: 'x' }] }), 'string');
  assert.equal(typeof parseMessages({ messages: [{ role: 'user', content: 'x'.repeat(501) }] }), 'string');
  assert.equal(typeof parseMessages({ messages: [{ role: 'assistant', content: 'hi' }] }), 'string');
  const ok = parseMessages({
    messages: [
      { role: 'user', content: '  first   question ' },
      { role: 'assistant', content: 'a'.repeat(5000) },
      { role: 'user', content: 'follow up' },
    ],
  });
  assert.ok(Array.isArray(ok));
  assert.equal(ok[0].content, 'first question');
  assert.equal(ok[1].content.length, 1500);
});

test('rateLimited allows a burst, then asks the visitor to wait', () => {
  const t = 1_000_000;
  for (let i = 0; i < 8; i++) assert.equal(rateLimited('1.2.3.4', t + i), 0);
  assert.ok(rateLimited('1.2.3.4', t + 10) > 0);
  assert.equal(rateLimited('1.2.3.4', t + 61_000), 0);
  for (let i = 0; i < 3; i++) assert.equal(rateLimited('5.6.7.8', t + i, 3, 100), 0);
  assert.ok(rateLimited('5.6.7.8', t + 5, 3, 100) > 0, 'custom per-minute limit');
});

test('plan resolves follow-ups, keeps the question, and never refuses on-topic words', async () => {
  const p1 = await plan(fakeEnv({ plan: { scope: 'on_topic', queries: ['Rochester tax cap schools'] } }), [], 'what about Rochester?');
  assert.deepEqual(p1.queries, ['Rochester tax cap schools', 'what about Rochester?']);
  const p2 = await plan(fakeEnv({ plan: { scope: 'off_topic', queries: [] } }), [], 'is the school tax cap legal?');
  assert.equal(p2.scope, 'on_topic');
  const p3 = await plan(fakeEnv({ plan: { scope: 'off_topic', queries: [] } }), [], 'write me a poem about cats');
  assert.equal(p3.scope, 'off_topic');
  const broken: Env = { AI: { run: async () => ({ response: 'not json' }) } };
  assert.deepEqual(await plan(broken, [], 'hello there'), { scope: 'on_topic', queries: ['hello there'] });
});

test('rerank reorders candidates by the reranker and falls back to search order', async () => {
  const { rerank, select, pool } = await import('../lib/retrieval.ts');
  const chunks = [
    { key: 'a.md', text: 'about Dover', score: 0.9, metadata: {} },
    { key: 'b.md', text: 'the 60% rule', score: 0.5, metadata: {} },
  ];
  const env: Env = { AI: { run: async () => ({ response: [{ id: 1, score: 0.97 }, { id: 0, score: 0.02 }] }) } };
  const ranked = await rerank(env, 'what is the 60% rule', chunks);
  assert.deepEqual(ranked.map((c) => c.key), ['b.md', 'a.md']);
  const broken: Env = { AI: { run: async () => { throw new Error('down'); } } };
  assert.deepEqual((await rerank(broken, 'q', chunks)).map((c) => c.key), ['a.md', 'b.md']);
  // select keeps at most 3 chunks per document
  const many = Array.from({ length: 5 }, (_, i) => ({ key: 'same.md', text: `part ${i}`, score: 1 - i / 10, metadata: {} }));
  assert.equal(select(many).length, 3);
  // pool dedupes and throws only when every search failed
  assert.equal(pool([{ status: 'fulfilled', value: [chunks[0], chunks[0]] }]).length, 1);
  assert.throws(() => pool([{ status: 'rejected', reason: new Error('x') }]));
});

test('a slow planner does not hold up a first question, but follow-ups wait for it', async () => {
  const slow = (ms: number, calls: string[]): Env => ({
    AI_SEARCH_INSTANCE: 'x',
    AI: {
      async run(model: string, input: unknown) {
        const i = input as { stream?: boolean; messages?: unknown };
        if (i.stream) return streamOf(['data: {"response":"ok"}\n\n', 'data: [DONE]\n\n']);
        if ((input as { contexts?: unknown }).contexts) return { response: [] };
        calls.push(model);
        await new Promise((r) => setTimeout(r, ms));
        return { response: '{"scope":"off_topic","queries":[]}' };
      },
      autorag: () => ({ search: async () => legacyResult([{ key: 'site--sixty--01-main.md', text: 'The 60% rule.' }]) }),
    },
    PLAN_TIMEOUT_MS: '50',
  });
  const t0 = Date.now();
  const first = await readEvents(await handleChat(req(ask('What is the 60% rule?')), slow(400, [])));
  assert.equal(first.meta.status, 'answer', 'searched as asked instead of waiting');
  assert.ok(Date.now() - t0 < 350);
  const follow = await readEvents(
    await handleChat(req({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hi!' }, { role: 'user', content: 'tell me a joke' }] }), slow(100, [])),
  );
  assert.equal(follow.meta.status, 'off_topic', 'follow-up waited for the planner');
});

test('demote pushes the lawsuit complaint down unless the question is about the lawsuit', async () => {
  const { demote } = await import('../lib/retrieval.ts');
  const chunks = [
    { key: 'primary--bates-complaint.md', text: 'x', score: 0.9, metadata: {} },
    { key: 'site--ballot--01-main.md', text: 'y', score: 0.5, metadata: {} },
  ];
  assert.equal(demote(chunks, 'What would Question 2 do?')[0].key, 'site--ballot--01-main.md');
  assert.equal(demote(chunks, 'Was there a lawsuit about Question 2?')[0].key, 'primary--bates-complaint.md');
});

test('PLAN_MODE=followups skips the planner on a first question but not on follow-ups', async () => {
  const calls: { model: string; input: { stream?: boolean; contexts?: unknown } }[] = [];
  // The planner is the one model call that is neither streamed (the answer) nor a rerank.
  const plannerCalls = () => calls.filter((c) => !c.input.stream && !c.input.contexts);
  const env = { ...fakeEnv({ calls: calls as unknown[] }), PLAN_MODE: 'followups' };
  await readEvents(await handleChat(req(ask('What does Question 2 do?')), env));
  assert.equal(plannerCalls().length, 0, 'no planner call on a first question');
  const hi = await readEvents(await handleChat(req(ask('Hi there!')), env));
  assert.equal(hi.meta.status, 'greeting');
  calls.length = 0;
  await readEvents(
    await handleChat(
      req({ messages: [{ role: 'user', content: 'What about Rochester?' }, { role: 'assistant', content: 'Rochester has a cap.' }, { role: 'user', content: 'And Dover?' }] }),
      env,
    ),
  );
  assert.equal(plannerCalls().length, 1, 'planner runs for a follow-up');
});

test('normalizeMarkers repairs the citation formats models actually write', async () => {
  const { normalizeMarkers } = await import('../lib/markers.ts');
  assert.equal(normalizeMarkers('a [ src:school-board-video@2717 ] b'), 'a [src:school-board-video@2717] b');
  assert.equal(normalizeMarkers('[src:page:top]'), '[page:top]');
  assert.equal(normalizeMarkers('[src:rsa-32-5-i, src:hb1300-text]'), '[src:rsa-32-5-i] [src:hb1300-text]');
  assert.equal(normalizeMarkers('[src:rsa-32-5-i; hb1300-text]'), '[src:rsa-32-5-i] [src:hb1300-text]');
  assert.equal(normalizeMarkers('[Page: Farmington]'), '[page:farmington]');
  assert.equal(normalizeMarkers('[src:x@ 12s]'), '[src:x@12]');
  assert.equal(normalizeMarkers('a【src:bates-complaint】【page:faq】b'), 'a[src:bates-complaint][page:faq]b');
  assert.equal(normalizeMarkers('［page：top］'), '[page:top]');
  assert.equal(normalizeMarkers('[1] and [see note]'), '[1] and [see note]', 'non-markers untouched');
  assert.equal(normalizeMarkers('[src:bad id!]'), '', 'unreadable markers dropped');
});

test('normalize reads both AI Search response shapes', () => {
  assert.deepEqual(normalize({ chunks: [{ text: 'a', score: 0.5, item: { key: 'k.md', metadata: { title: 'T' } } }] }), [
    { key: 'k.md', text: 'a', score: 0.5, metadata: { title: 'T' } },
  ]);
  assert.equal(normalize(legacyResult([{ key: 'x.md', text: 'b' }]))[0].text, 'b');
  assert.deepEqual(normalize(null), []);
});

test('buildContext allows only known sources and page sections', () => {
  const ctx = buildContext([
    { key: 'site--farmington--02-why-so-tight.md', text: 'Gap. [src:school-board-video@2772] [src:made-up] [page:nowhere]', score: 0.9, metadata: {} },
    { key: 'primary--superior-order.md', text: 'DENIED.', score: 0.7, metadata: {} },
  ]);
  assert.deepEqual(ctx.sources.map((s) => s.id).sort(), ['school-board-video', 'superior-order']);
  assert.deepEqual(ctx.pages.map((p) => p.id), ['farmington']);
  assert.ok(ctx.markers.includes('[src:school-board-video@2772]'));
  assert.ok(!ctx.markers.some((m) => m.includes('made-up') || m.includes('nowhere')));
  assert.equal(ctx.sources.find((s) => s.id === 'school-board-video')?.video, true);
  assert.match(ctx.docsText, /<document type="this guide" title="What it means for Farmington" note="Written by the guide’s author/);
  assert.match(ctx.docsText, /<document type="primary document" title="Order on motion[^"]*">/);
});

test('rejects other methods, other origins and bad bodies', async () => {
  const env = fakeEnv();
  assert.equal((await handleChat(new Request('https://x.dev/api/chat'), env)).status, 405);
  assert.equal((await handleChat(req(ask('hi'), { origin: 'https://evil.example' }), env)).status, 403);
  const noOrigin = new Request('https://farmington-hb1300.pages.dev/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await handleChat(noOrigin, env)).status, 403);
  assert.equal((await handleChat(req({ messages: [] }), env)).status, 400);
  assert.equal((await handleChat(req(ask('hi')), { ...env, CHAT_ENABLED: 'false' })).status, 503);
  assert.equal((await handleChat(req(ask('hi')), { AI_SEARCH_INSTANCE: 'x' })).status, 503);
});

test('eval mode lets previews pick an allowed model and returns debug info', async () => {
  const calls: { model: string; input: { stream?: boolean; reasoning_effort?: string } }[] = [];
  const headers = { 'x-chat-model': '@cf/openai/gpt-oss-120b', 'x-reasoning-effort': 'medium' };
  const on = await readEvents(await handleChat(req(ask('What does Question 2 do?'), headers), { ...fakeEnv({ calls: calls as unknown[] }), CHAT_EVAL: 'true' }));
  const answer = calls.find((c) => c.input.stream)!;
  assert.equal(answer.model, '@cf/openai/gpt-oss-120b');
  assert.equal(answer.input.reasoning_effort, 'medium');
  assert.ok(on.meta.debug && Array.isArray(on.meta.debug.chunks));

  calls.length = 0;
  const off = await readEvents(await handleChat(req(ask('What does Question 2 do?'), { ...headers, 'x-chat-model': '@cf/some/expensive-model' }), { ...fakeEnv({ calls: calls as unknown[] }), CHAT_EVAL: 'true' }));
  assert.equal(calls.find((c) => c.input.stream)!.model, '@cf/deepseek-ai/deepseek-v4.1-flash-1017', 'unlisted model ignored');
  assert.ok(off.meta.debug);

  calls.length = 0;
  const prod = await readEvents(await handleChat(req(ask('What does Question 2 do?'), headers), fakeEnv({ calls: calls as unknown[] })));
  assert.equal(calls.find((c) => c.input.stream)!.model, '@cf/deepseek-ai/deepseek-v4.1-flash-1017', 'headers ignored without CHAT_EVAL');
  assert.equal(calls.find((c) => c.input.stream)!.input.reasoning_effort, 'none', 'DeepSeek reasoning off by default');
  assert.equal(prod.meta.debug, undefined);
});

test('answers with the retrieved documents and an allowlist of citations', async () => {
  const calls: { model: string; input: { messages: { role: string; content: string }[] } }[] = [];
  const res = await handleChat(req(ask('Does Question 2 only cap administration?')), fakeEnv({ calls: calls as unknown[] }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
  const { meta, data } = await readEvents(res);
  assert.equal(meta.status, 'answer');
  assert.deepEqual(meta.sources.map((s: { id: string }) => s.id).sort(), ['hb1300-text', 'rsa-32-5-i']);
  assert.deepEqual(meta.pages, [{ id: 'ballot', title: 'What the ballot says' }]);
  assert.equal(data.at(-1), '[DONE]');
  assert.match(data[0], /It limits the levy/);

  const answerCall = calls.find((c) => (c.input as { stream?: boolean }).stream);
  assert.ok(answerCall);
  const last = answerCall.input.messages.at(-1)!.content;
  assert.match(last, /Allowed citation markers: .*\[src:rsa-32-5-i\]/);
  assert.doesNotMatch(last, /Allowed citation markers: .*not-a-real-source/);
  assert.match(answerCall.input.messages[0].content, /Use only the documents provided/);
});

test('does not ask the model to answer when nothing relevant is found', async () => {
  const calls: unknown[] = [];
  const res = await handleChat(req(ask('What is the capital of France?')), fakeEnv({ calls, search: () => legacyResult([]) }));
  const { meta, data } = await readEvents(res);
  assert.equal(meta.status, 'no_match');
  assert.match(JSON.parse(data[0]).response, /couldn’t find that/);
  assert.ok(!calls.some((c) => (c as { input: { stream?: boolean } }).input.stream), 'no answer model call');
});

test('greetings and off-topic requests get fixed replies without the answer model', async () => {
  let searches = 0;
  const search = () => {
    searches++;
    return legacyResult([]);
  };
  const hi = await readEvents(await handleChat(req(ask('hello!')), fakeEnv({ plan: { scope: 'greeting', queries: [] }, search })));
  assert.equal(hi.meta.status, 'greeting');
  const off = await readEvents(await handleChat(req(ask('write a poem about cats')), fakeEnv({ plan: { scope: 'off_topic', queries: [] }, search })));
  assert.equal(off.meta.status, 'off_topic');
  // Only the speculative search of the question as asked (started while planning) runs.
  assert.equal(searches, 2);
});

test('retries once when every search comes back empty', async () => {
  let n = 0;
  const search = () => (++n <= 2 ? legacyResult([]) : legacyResult([{ key: 'site--sixty--01-main.md', text: 'The 60% rule. [src:rsa-32-5-i]' }]));
  const res = await readEvents(await handleChat(req(ask('What is the 60% rule?')), fakeEnv({ plan: { scope: 'on_topic', queries: ['What is the 60% rule?'] }, search })));
  assert.equal(res.meta.status, 'answer');
  assert.equal(n, 3);
});

test('falls back to another model when the answer model errors', async () => {
  const calls: string[] = [];
  const env: Env = {
    ...fakeEnv(),
    AI: {
      ...fakeEnv().AI!,
      async run(model: string, input: unknown) {
        const i = input as { stream?: boolean; contexts?: unknown };
        if (i.contexts) return { response: [] };
        if (!i.stream) return { response: '{"scope":"on_topic","queries":["q"]}' };
        calls.push(model);
        if (calls.length === 1) throw new Error('3021: rate limiting: inference request per min rate reached');
        return streamOf(['data: {"response":"ok"}\n\n', 'data: [DONE]\n\n']);
      },
    },
  };
  const res = await readEvents(await handleChat(req(ask('What is the 60% rule?')), env));
  assert.equal(res.meta.status, 'answer');
  assert.deepEqual(calls, ['@cf/deepseek-ai/deepseek-v4.1-flash-1017', '@cf/zai-org/glm-5.3-flash']);
});

test('reports a clear error when AI Search is unreachable', async () => {
  const res = await handleChat(
    req(ask('What is the levy?')),
    fakeEnv({
      search: () => {
        throw new Error('instance not found');
      },
    }),
  );
  assert.equal(res.status, 503);
});

test('the answer prompt keeps the bot grounded and neutral about the author', async () => {
  const { answerPrompt } = await import('../lib/prompts.ts');
  const p = answerPrompt('2026-10-21');
  assert.match(p, /Brittni Widdick/);
  assert.match(p, /Never use he, she, his, or her for the author/);
  assert.match(p, /Never fill gaps from memory/);
  assert.match(p, /hi@hb1300\.com/);
});

test('hint queries cover broad, how-to-vote and tax-relief first questions, and nothing else', () => {
  for (const q of ['What does Question 2 do?', 'What would Question 2 actually do?', 'Explain HB 1300', 'what is this ballot question about', 'Can you summarize the tax cap?', "What's HB 1300?", 'Tell me about Question 2', 'What does question 2 mean for Farmington?'])
    assert.equal(hintQueries(q).length, 1, q);
  for (const q of ['How should I vote?', "What's the best argument for voting yes?", 'Is the cap a good idea?', 'pros and cons of question 2', 'What do supporters of the cap say?'])
    assert.equal(hintQueries(q).length, 2, q);
  for (const q of ["I'm 72 and my property taxes are too high. Is there any help besides the cap?", 'Is there tax relief for seniors?', "I'm retired on a fixed income", 'How does the elderly exemption work?'])
    assert.match(hintQueries(q).join(' '), /elderly exemption/, q);
  // Specific questions (from the test battery) that the question's own wording finds.
  for (const q of [
    'What is the 60% rule?', 'When would the cap start?', 'Who decides for Farmington?', 'Tell me about Dover', 'hi',
    'What inflation number does the cap use?', 'If the schools need more money than the cap allows, what happens?',
    'Was there a lawsuit about Question 2? What happened?', 'What happens if I skip Question 2 on my ballot?',
    'What would Farmington cut if the cap passes?', 'What would the cap cut?',
  ])
    assert.deepEqual(hintQueries(q), [], q);
});

test('a broad first question also searches the summary hint, alongside the question as asked', async () => {
  const queries: string[] = [];
  const env = fakeEnv({ plan: { scope: 'on_topic', queries: ['What would Question 2 actually do?'] } });
  const rag = env.AI!.autorag!('x');
  env.AI!.autorag = () => ({
    search: async (args: { query: string }) => {
      queries.push(args.query);
      return rag.search(args as never);
    },
  });
  const res = await readEvents(await handleChat(req(ask('What would Question 2 actually do?')), env));
  assert.equal(res.meta.status, 'answer');
  assert.equal(queries[0], 'What would Question 2 actually do?');
  assert.ok(queries.some((q) => q.startsWith('plain-English summary of what Question 2 does')), queries.join(' | '));
  assert.equal(new Set(queries).size, queries.length, 'no query searched twice');
});

test('rerank scores at most RERANK_MAX candidates and keeps the search order if it fails', async () => {
  const { rerank, RERANK_MAX } = await import('../lib/retrieval.ts');
  const chunks = Array.from({ length: RERANK_MAX + 25 }, (_, i) => ({ key: `k${i}.md`, text: `t${i}`, score: 1 - i / 1000 }));
  let scored = 0;
  const env = {
    AI: {
      async run(_m: string, input: { contexts: unknown[] }) {
        scored = input.contexts.length;
        return { response: input.contexts.map((_, id) => ({ id, score: id / 100 })) };
      },
    },
  } as unknown as Env;
  const out = await rerank(env, 'q', chunks);
  assert.equal(scored, RERANK_MAX);
  assert.equal(out.length, RERANK_MAX);
  assert.equal(out[0].key, `k${RERANK_MAX - 1}.md`, 'reordered by the reranker');
  const failing = { AI: { run: async () => { throw new Error('boom'); } } } as unknown as Env;
  assert.equal((await rerank(failing, 'q', chunks)).length, chunks.length, 'falls back to all candidates');
});

test('when nothing is found, a slow planner still gets to call a first question off-topic', async () => {
  // A planner slower than PLAN_TIMEOUT_MS that calls everything off-topic.
  const slowOffTopic = (env: Env): Env => {
    const run = env.AI!.run.bind(env.AI);
    env.AI!.run = async (model: string, input: unknown) => {
      const i = input as { stream?: boolean; contexts?: unknown };
      if (i.stream || i.contexts) return run(model, input);
      await new Promise((r) => setTimeout(r, 120));
      return { response: '{"scope":"off_topic","queries":[]}' };
    };
    return { ...env, PLAN_TIMEOUT_MS: '20' };
  };
  const empty = await readEvents(await handleChat(req(ask('Can you write me a poem about autumn?')), slowOffTopic(fakeEnv({ search: () => legacyResult([]) }))));
  assert.equal(empty.meta.status, 'off_topic');
  const found = await readEvents(await handleChat(req(ask('Can you write me a poem about autumn?')), slowOffTopic(fakeEnv())));
  assert.equal(found.meta.status, 'answer', 'when documents were found, the answer model handles scope (rule 9)');
});

test("a how-to-vote question keeps both sides' passages even when the reranker prefers others", async () => {
  const byQuery: Record<string, { key: string; text: string }[]> = {
    "the guide author's reasons to vote No on Question 2": [{ key: 'site--quick--01-main.md', text: 'I recommend voting No because...' }],
    "supporters' strongest arguments for the school tax cap": [{ key: 'site--other-side--01-main.md', text: 'Supporters say property taxes are climbing too fast.' }],
  };
  const generic = Array.from({ length: 12 }, (_, i) => ({ key: `site--vote--0${i % 4}-x.md`, text: `How to vote, part ${i}` }));
  const env: Env = {
    ...fakeEnv(),
    CHAT_EVAL: 'true',
    AI: {
      ...fakeEnv().AI!,
      async run(model: string, input: unknown) {
        const i = input as { stream?: boolean; contexts?: { text: string }[] };
        // Reranker: score the supporters' passage lowest of all.
        if (i.contexts) return { response: i.contexts.map((c, id) => ({ id, score: c.text.startsWith('Supporters') ? 0.01 : 0.9 - id / 100 })) };
        return fakeEnv().AI!.run(model, input);
      },
      autorag: () => ({ search: async (args: { query: string }) => legacyResult(byQuery[args.query] ?? generic) }),
    },
  };
  const res = await readEvents(await handleChat(req(ask('How should I vote on Question 2?'), { 'x-plan-timeout': '1' }), env));
  const keys = (res.meta.debug.chunks as { key: string }[]).map((c) => c.key);
  assert.ok(keys.includes('site--other-side--01-main.md'), keys.join(', '));
  assert.ok(keys.includes('site--quick--01-main.md'), keys.join(', '));
});

test('a stuck search, reranker or planner is given up on, and the visitor still gets an answer', async () => {
  const never = new Promise<never>(() => {});
  const fast = { SEARCH_TIMEOUT_MS: '50', RERANK_TIMEOUT_MS: '50', PLAN_TIMEOUT_MS: '20' };

  // The summary-hint search never returns; the question's own search does.
  const base = fakeEnv();
  const rag = base.AI!.autorag!('x');
  const stuckHint: Env = {
    ...base,
    ...fast,
    AI: { ...base.AI!, autorag: () => ({ search: (args: { query: string }) => (args.query.startsWith('plain-English summary') ? never : rag.search(args as never)) }) },
  };
  let t0 = Date.now();
  let res = await readEvents(await handleChat(req(ask('What does Question 2 do?')), stuckHint));
  assert.equal(res.meta.status, 'answer');
  assert.ok(Date.now() - t0 < 2000, 'answered without waiting on the stuck search');

  // The reranker never returns.
  const stuckRerank = fakeEnv();
  const run = stuckRerank.AI!.run.bind(stuckRerank.AI);
  stuckRerank.AI!.run = (model: string, input: unknown) => ((input as { contexts?: unknown }).contexts ? never : run(model, input));
  t0 = Date.now();
  res = await readEvents(await handleChat(req(ask('What is the levy?')), { ...stuckRerank, ...fast }));
  assert.equal(res.meta.status, 'answer');
  assert.ok(Date.now() - t0 < 2000, 'answered in search order');

  // The planner never returns on a follow-up (which waits for it).
  const stuckPlanner = fakeEnv();
  const run2 = stuckPlanner.AI!.run.bind(stuckPlanner.AI);
  stuckPlanner.AI!.run = (model: string, input: unknown) => {
    const i = input as { stream?: boolean; contexts?: unknown };
    return i.stream || i.contexts ? run2(model, input) : never;
  };
  t0 = Date.now();
  res = await readEvents(
    await handleChat(
      req({ messages: [{ role: 'user', content: 'What about Rochester?' }, { role: 'assistant', content: 'Rochester has a cap.' }, { role: 'user', content: 'And Dover?' }] }),
      { ...stuckPlanner, ...fast },
    ),
  );
  assert.equal(res.meta.status, 'answer');
  assert.ok(Date.now() - t0 < 2000, 'follow-up searched as asked');
});
