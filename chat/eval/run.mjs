// Runs the question battery against a preview deployment for one or more answer models.
// CHAT_URL=https://<branch>.farmington-hb1300.pages.dev node chat/eval/run.mjs out.json '@cf/openai/gpt-oss-120b:low' [...]
// env: ONLY=id1,id2 (subset), CONC=3. Each answer uses Workers AI neurons (about 140), which on the
// Workers Free plan come out of the same 10,000-a-day allowance as real visitors' questions.
import fs from 'node:fs';
import { battery } from './battery.mjs';
const U = process.env.CHAT_URL; // a preview deployment URL (CHAT_EVAL is on for previews only)
if (!U) throw new Error('Set CHAT_URL to a preview deployment, e.g. https://<branch>.farmington-hb1300.pages.dev');
const [out, ...models] = process.argv.slice(2);
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const items = battery.filter((b) => !only || only.has(b.id));

async function ask(messages, model, effort) {
  const t0 = Date.now();
  const headers = { origin: U, 'content-type': 'application/json', 'x-chat-model': model };
  if (effort !== undefined) headers['x-reasoning-effort'] = effort;
  let res, raw;
  for (let attempt = 1; attempt <= 3; attempt++) {
    res = await fetch(`${U}/api/chat`, { method: 'POST', headers, body: JSON.stringify({ messages }) });
    raw = await res.text();
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 15000));
  }
  let meta = null, text = '', done = false, firstTokenMs = null, other = [], neurons = 0, usage = null;
  for (const block of raw.replace(/\r/g, '').split('\n\n')) {
    let ev = 'message'; const data = [];
    for (const l of block.split('\n')) { if (l.startsWith('event:')) ev = l.slice(6).trim(); else if (l.startsWith('data:')) data.push(l.slice(5).replace(/^ /, '')); }
    const p = data.join('\n'); if (!p) continue;
    if (ev === 'meta') { try { meta = JSON.parse(p); } catch {} continue; }
    if (p === '[DONE]') { done = true; continue; }
    try {
      const o = JSON.parse(p);
      if (o.usage) { usage = o.usage; if (o.usage.neurons) neurons = o.usage.neurons; }
      const piece = typeof o.response === 'string' ? o.response : (o.choices?.[0]?.delta?.content ?? '');
      if (piece) text += piece; else if (other.length < 3) other.push(p.slice(0, 200));
    } catch { if (other.length < 3) other.push(p.slice(0, 200)); }
  }
  return { http: res.status, ms: Date.now() - t0, status: meta?.status ?? null, sources: meta?.sources ?? [], pages: meta?.pages ?? [], debug: meta?.debug ?? null, text: text.trim(), done, error: res.ok ? null : raw.slice(0, 400), neurons, usage };
}

const results = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
const have = new Set(results.map((r) => `${r.model}|${r.id}`));
const jobs = [];
for (const spec of models) {
  const [model, effort] = spec.split(':');
  for (const it of items) if (!have.has(`${spec}|${it.id}`)) jobs.push({ spec, model, effort, it });
}
const CONC = Number(process.env.CONC || 3);
let i = 0, fails = 0, totalNeurons = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < jobs.length) {
    const { spec, model, effort, it } = jobs[i++];
    const turns = [{ role: 'user', content: it.q }];
    const r1 = await ask(turns, model, effort);
    const rec = { model: spec, id: it.id, cat: it.cat, q: it.q, ...r1 };
    if (it.follow && r1.text) {
      const r2 = await ask([...turns, { role: 'assistant', content: r1.text }, { role: 'user', content: it.follow }], model, effort);
      rec.followup = { q: it.follow, ...r2 };
    }
    if (r1.http !== 200) fails++;
    results.push(rec);
    fs.writeFileSync(out, JSON.stringify(results, null, 1));
    totalNeurons += (r1.neurons || 0) + (rec.followup?.neurons || 0);
    console.log(`${spec.split('/').pop()} ${it.id}: http=${r1.http} status=${r1.status} ${r1.ms}ms ${r1.text.length}ch n=${Math.round(r1.neurons || 0)} total=${Math.round(totalNeurons)}${r1.error ? ' ERR ' + r1.error.slice(0, 160) : ''}`);
    if (r1.error && /allocation|neurons|4006/i.test(r1.error)) { console.log('Daily Workers AI allocation used up; stopping.'); process.exit(3); }
    if (fails >= 6) { console.log('Too many failures; stopping.'); process.exit(2); }
  }
}));
console.log(`done: ${results.length} records in ${out}`);
