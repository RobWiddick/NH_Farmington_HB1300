// Search-only check: does retrieval put the section each core question needs in the top 5?
// Uses no answer-model neurons. CHAT_URL=https://<branch>.farmington-hb1300.pages.dev node chat/eval/retrieval-check.mjs
// (PLAN=always also runs the planner, about 20 neurons a question.)
const U = process.env.CHAT_URL; // a preview deployment URL (CHAT_EVAL is on for previews only)
if (!U) throw new Error('Set CHAT_URL to a preview deployment, e.g. https://<branch>.farmington-hb1300.pages.dev');
const plan = process.env.PLAN || 'followups';
const EXPECT = {
  'What would Question 2 actually do?': /quick--01|top--01|ballot--01|faq--09/,
  'Will Question 2 lower my property tax bill?': /faq--01|quick--01|ballot--01/,
  'The ballot says the caps only apply to administration. Is that true?': /ballot--01|ballot--03|quick--01/,
  'What does the 60% rule mean?': /sixty--01/,
  'When would the cap start, and how long does it last?': /faq--02|unknowns--01/,
  'What inflation number does the cap use?': /unknowns--0|math--01|faq--09/,
  'If the schools need more money than the cap allows, what happens?': /faq--04|sixty--01/,
  'Was there a lawsuit about Question 2? What happened?': /superior-order|nhsc|unknowns|faq|ballot--03/,
  'What happens if I skip Question 2 on my ballot?': /unknowns--02/,
  'How much would Farmington be short in the first year?': /farmington--01|quick--01|top--01/,
  "Why wouldn't a 3% increase be enough for Farmington's schools?": /farmington--02/,
  'Would the 6% administration cap affect Farmington?': /faq--05|farmington--03/,
  'How did Farmington vote on the school budget in 2026?': /farmington--04/,
  'What would Farmington cut if the cap passes?': /farmington--03|unknowns--03/,
  "Didn't Farmington's school district have money problems?": /farmington--05/,
  'What do supporters of the cap say?': /other-side--01/,
  'Did tax caps work in other states?': /other-side--02|nearby/,
  'How should I vote on Question 2?': /quick--01|top--0|other-side|vote--01/,
  'Who wrote this website, and are they biased?': /about-this-guide/,
  'What happened in Franklin with its tax cap?': /nearby--04/,
};
let ok = 0, n = 0;
for (const [q, want] of Object.entries(EXPECT)) {
  const t0 = Date.now();
  const res = await fetch(`${U}/api/chat`, { method: 'POST', headers: { origin: U, 'content-type': 'application/json', 'x-search-only': '1', 'x-plan': plan }, body: JSON.stringify({ messages: [{ role: 'user', content: q }] }) });
  const j = await res.json().catch(() => ({}));
  const keys = (j.chunks ?? []).map((c) => c.key.replace(/\.md$/, ''));
  const rank = keys.findIndex((k) => want.test(k));
  const hit = rank >= 0 && rank < 5;
  n++; if (hit) ok++;
  console.log(`${hit ? 'OK ' : 'BAD'} rank=${String(rank).padStart(2)} ${String(Date.now() - t0).padStart(5)}ms ${q.slice(0, 58).padEnd(58)} ${keys.slice(0, 3).join(' | ')}${res.ok ? '' : ' HTTP ' + res.status}`);
}
console.log(`== ${ok}/${n} with the needed section in the top 5 (planner: ${plan})`);
