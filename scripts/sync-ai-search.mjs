// Creates the Cloudflare AI Search instance (if needed) and syncs chat-corpus/
// into its built-in storage: uploads new and changed documents, deletes ones
// that are gone, waits for indexing, then runs one test search.
//
// Env: CLOUDFLARE_API_TOKEN (AI Search: Edit + Run), CLOUDFLARE_ACCOUNT_ID,
//      AI_SEARCH_INSTANCE (e.g. farmington-hb1300), optional AI_SEARCH_NAMESPACE.
// Usage: node scripts/sync-ai-search.mjs [corpus-dir]
//
// A token without AI Search permissions is reported as a warning (exit 0) so the
// site itself still deploys; any other failure exits 1.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? 'chat-corpus';
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const instance = process.env.AI_SEARCH_INSTANCE;
const namespace = process.env.AI_SEARCH_NAMESPACE || 'default';
const summary = [];

const note = (s) => {
  console.log(s);
  summary.push(s);
};
const writeSummary = () => {
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### AI Search sync: \`${instance}\`\n\n${summary.map((s) => `- ${s}`).join('\n')}\n`);
};
const done = (code, msg) => {
  if (msg) console.log(msg);
  writeSummary();
  process.exit(code);
};

if (!token || !account || !instance) done(1, 'Set CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and AI_SEARCH_INSTANCE.');
const manifestPath = path.join(dir, 'manifest.json');
if (!fs.existsSync(manifestPath)) done(1, `${manifestPath} not found. Run npm run build first.`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const apiBase = process.env.CF_API_BASE || 'https://api.cloudflare.com/client/v4'; // overridable for tests
const base = `${apiBase}/accounts/${account}/ai-search/namespaces/${namespace}/instances`;

async function api(method, url, body) {
  const init = { method, headers: { authorization: `Bearer ${token}` } };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* empty body */
    }
    // Retry rate limits, server errors and "ai_search_instance_overloaded" (code
    // 7114, which can come back with a 4xx status while the instance is busy indexing).
    const overloaded = json?.errors?.some?.((e) => e?.code === 7114 || /overloaded/i.test(e?.message ?? ''));
    if ((res.status === 429 || res.status >= 500 || overloaded) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      continue;
    }
    return { status: res.status, ok: res.ok && json?.success !== false, json };
  }
}
const errText = (r) => JSON.stringify(r.json?.errors ?? r.json ?? r.status).slice(0, 500);

function permissionHelp(r) {
  console.log(
    `::warning title=Chat assistant not synced::The Cloudflare API token can't manage AI Search (HTTP ${r.status}). ` +
      'Add the permissions "Account > AI Search > Edit" and "Account > AI Search > Run" to CLOUDFLARE_API_TOKEN (see README). The site still deployed; the assistant will say it is unavailable until this works.',
  );
  note(`Skipped: the API token lacks AI Search permissions (HTTP ${r.status}). ${errText(r)}`);
  done(0);
}

// ---------- 1. Instance ----------
let r = await api('GET', `${base}/${instance}`);
if (r.status === 401 || r.status === 403) permissionHelp(r);
if (r.status === 404 || (!r.ok && /not.?found/i.test(errText(r)))) {
  const config = {
    id: instance,
    chunk_size: 384,
    chunk_overlap: 15,
    index_method: { vector: true, keyword: true },
    reranking: true,
    reranking_model: '@cf/baai/bge-reranker-base',
    max_num_results: 8,
    score_threshold: 0.3,
    rewrite_query: false,
    cache: false,
    retrieval_options: { keyword_match_mode: 'or' },
    custom_metadata: ['title', 'section', 'source', 'hash'].map((field_name) => ({ field_name, data_type: 'text' })),
  };
  r = await api('POST', base, config);
  if (r.status === 401 || r.status === 403) permissionHelp(r);
  if (!r.ok) {
    console.log(`Create with full settings failed (${errText(r)}); retrying with defaults.`);
    r = await api('POST', base, { id: instance, custom_metadata: config.custom_metadata });
  }
  if (!r.ok) r = await api('POST', base, { id: instance });
  if (!r.ok) done(1, `Could not create AI Search instance "${instance}": ${errText(r)}`);
  note(`Created AI Search instance \`${instance}\`.`);
  await new Promise((res) => setTimeout(res, 3000));
} else if (!r.ok) {
  done(1, `Could not read AI Search instance "${instance}": ${errText(r)}`);
} else {
  note(`Instance \`${instance}\` exists.`);
}

// ---------- 2. Diff ----------
async function listItems() {
  const items = [];
  for (let page = 1; page < 200; page++) {
    const res = await api('GET', `${base}/${instance}/items?per_page=50&page=${page}&source=builtin`);
    if (res.status === 401 || res.status === 403) permissionHelp(res);
    if (!res.ok) throw new Error(`list items: ${errText(res)}`);
    const batch = res.json?.result ?? [];
    items.push(...batch);
    const total = res.json?.result_info?.total_count ?? items.length;
    if (!batch.length || items.length >= total) break;
  }
  return items;
}

const existing = await listItems();
const byKey = new Map(existing.map((i) => [i.key, i]));
const wanted = new Map(manifest.docs.map((d) => [d.key, d]));
const toUpload = [];
const toDelete = [];
let unchanged = 0;
for (const d of manifest.docs) {
  const item = byKey.get(d.key);
  if (item && item.metadata?.hash === d.hash && item.status !== 'error' && item.next_action !== 'DELETE') unchanged++;
  else toUpload.push({ ...d, existingId: item?.id });
}
for (const item of existing) if (!wanted.has(item.key)) toDelete.push(item);
note(`${manifest.docs.length} documents: ${unchanged} unchanged, ${toUpload.length} to upload, ${toDelete.length} to remove.`);

// ---------- 3. Apply ----------
async function pool(list, n, fn) {
  const queue = [...list];
  const errors = [];
  await Promise.all(
    Array.from({ length: Math.min(n, queue.length) }, async () => {
      for (let x = queue.shift(); x; x = queue.shift()) {
        try {
          await fn(x);
        } catch (e) {
          errors.push(`${x.key}: ${e.message}`);
        }
      }
    }),
  );
  return errors;
}

let metadataSupported = true;
const errors = [
  ...(await pool(toDelete, 4, async (item) => {
    const res = await api('DELETE', `${base}/${instance}/items/${encodeURIComponent(item.id)}`);
    if (!res.ok && res.status !== 404) throw new Error(`delete failed: ${errText(res)}`);
  })),
];
errors.push(
  ...(await pool(toUpload, 4, async (d) => {
    const content = fs.readFileSync(path.join(dir, d.key));
    const form = () => {
      const f = new FormData();
      f.append('file', new Blob([content], { type: 'text/markdown' }), d.key);
      return f;
    };
    let res;
    if (metadataSupported) {
      const f = form();
      const meta = Object.fromEntries(Object.entries({ title: d.title.slice(0, 120), section: d.section, source: d.source, hash: d.hash }).filter(([, v]) => v));
      f.append('metadata', JSON.stringify(meta));
      res = await api('POST', `${base}/${instance}/items`, f);
      if (!res.ok && res.status === 400 && /metadata/i.test(errText(res))) {
        metadataSupported = false;
        console.log(`Instance doesn't accept the custom metadata fields; uploading without them (${errText(res)}).`);
      }
    }
    if (!metadataSupported) res = await api('POST', `${base}/${instance}/items`, form());
    // If the store won't overwrite an existing key, delete the old copy and try once more.
    if (!res.ok && d.existingId && (res.status === 409 || /exist/i.test(errText(res)))) {
      await api('DELETE', `${base}/${instance}/items/${encodeURIComponent(d.existingId)}`);
      res = await api('POST', `${base}/${instance}/items`, form());
    }
    if (!res.ok) throw new Error(`upload failed: ${errText(res)}`);
  })),
);
if (!metadataSupported) note('Custom metadata is off for this instance, so every deploy re-uploads all documents.');
if (errors.length) {
  for (const e of errors) console.log(`::error::${e}`);
  done(1, `${errors.length} upload/delete error(s).`);
}

// ---------- 4. Wait for indexing ----------
if (toUpload.length) {
  const keys = new Set(toUpload.map((d) => d.key));
  const deadline = Date.now() + 240_000;
  let pending = keys.size;
  let failed = [];
  while (Date.now() < deadline) {
    const items = (await listItems()).filter((i) => keys.has(i.key));
    pending = items.filter((i) => ['queued', 'running'].includes(i.status)).length + (keys.size - items.length);
    failed = items.filter((i) => i.status === 'error');
    if (!pending) break;
    await new Promise((res) => setTimeout(res, 5000));
  }
  for (const f of failed) console.log(`::warning::AI Search could not index ${f.key}: ${f.error ?? 'unknown error'}`);
  note(pending ? `${pending} document(s) still indexing after 4 minutes; they'll finish in the background.` : `Indexed ${keys.size - failed.length} document(s)${failed.length ? `, ${failed.length} failed` : ''}.`);
}

// ---------- 5. Test search ----------
const test = await api('POST', `${base}/${instance}/search`, {
  messages: [{ role: 'user', content: 'Does Question 2 only cap administration?' }],
  ai_search_options: { retrieval: { max_num_results: 3 } },
});
if (test.ok) {
  const keys = (test.json?.result?.chunks ?? []).map((c) => c.item?.key).filter(Boolean);
  note(`Test search returned ${keys.length} chunk(s)${keys.length ? `: ${[...new Set(keys)].join(', ')}` : ''}.`);
} else {
  note(`Test search failed (HTTP ${test.status}): ${errText(test)}`);
}
done(0);
