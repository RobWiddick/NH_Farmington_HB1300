// Tests for the chat agent with fake Cloudflare bindings. Run: npm run test:chat
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildContext } from '../lib/citations.ts';
import { handleChat, parseMessages, plan, rateLimited } from '../lib/handler.ts';
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
  assert.match(ctx.docsText, /<document type="this guide" title="What it means for Farmington">/);
  assert.match(ctx.docsText, /<document type="primary document" title="Order on motion/);
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
  const headers = { 'x-chat-model': '@cf/deepseek-ai/deepseek-v4.1-flash-1017', 'x-reasoning-effort': 'none' };
  const on = await readEvents(await handleChat(req(ask('What does Question 2 do?'), headers), { ...fakeEnv({ calls: calls as unknown[] }), CHAT_EVAL: 'true' }));
  const answer = calls.find((c) => c.input.stream)!;
  assert.equal(answer.model, '@cf/deepseek-ai/deepseek-v4.1-flash-1017');
  assert.equal(answer.input.reasoning_effort, 'none');
  assert.ok(on.meta.debug && Array.isArray(on.meta.debug.chunks));

  calls.length = 0;
  const off = await readEvents(await handleChat(req(ask('What does Question 2 do?'), { ...headers, 'x-chat-model': '@cf/some/expensive-model' }), { ...fakeEnv({ calls: calls as unknown[] }), CHAT_EVAL: 'true' }));
  assert.equal(calls.find((c) => c.input.stream)!.model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'unlisted model ignored');
  assert.ok(off.meta.debug);

  calls.length = 0;
  const prod = await readEvents(await handleChat(req(ask('What does Question 2 do?'), headers), fakeEnv({ calls: calls as unknown[] })));
  assert.equal(calls.find((c) => c.input.stream)!.model, '@cf/meta/llama-3.3-70b-instruct-fp8-fast', 'headers ignored without CHAT_EVAL');
  assert.equal(calls.find((c) => c.input.stream)!.input.reasoning_effort, undefined);
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
  assert.match(p, /never use he or she for the author/);
  assert.match(p, /Never fill gaps from memory/);
  assert.match(p, /hi@hb1300\.com/);
});
