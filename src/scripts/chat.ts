// Client for the "Ask a question" assistant (src/components/Chat.astro).
//
// Sends the conversation to /api/chat and renders the streamed answer. Answers
// are plain text with citation markers: [src:id] or [src:id@seconds] become
// source links (new window, rel="nofollow") and [page:id] becomes a link to a
// section of this page, but only for ids in the allowlist the server sends with
// each answer. Everything else is shown as text; nothing is inserted as HTML.
//
// GA4 events (no question or answer text is ever sent):
//   chat_open      { from }                       the dialog was opened
//   chat_question  { turn, suggested }            a question was sent
//   chat_answer    { status, sources_cited, seconds }
//   chat_error     { reason }
//   chat_reset
import { send } from './analytics';
import { MARKER, normalizeMarkers } from '../../chat/lib/markers.ts';

interface Src {
  id: string;
  short: string;
  title: string;
  publisher: string;
  date?: string;
  url: string;
  video: boolean;
}
interface Meta {
  status: 'answer' | 'no_match' | 'off_topic' | 'greeting';
  sources: Src[];
  pages: { id: string; title: string }[];
}
interface Turn {
  role: 'user' | 'assistant';
  content: string;
  meta?: Meta;
  error?: boolean;
}

const STORE_KEY = 'q2-chat-v1';

const store = {
  load(): Turn[] {
    try {
      const v = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  },
  save(turns: Turn[]) {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(turns.slice(-20)));
    } catch {
      /* storage unavailable: the chat still works, it just isn't remembered */
    }
  },
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function sourceLink(src: Src, secs?: number): HTMLAnchorElement {
  const a = el('a', 'cite');
  let href = src.url;
  let label = src.short;
  if (secs !== undefined && src.video) {
    const u = new URL(src.url);
    u.searchParams.set('t', `${secs}s`);
    href = u.toString();
    label = `${src.short} at ${clock(secs)}`;
  }
  a.href = href;
  a.target = '_blank';
  a.rel = 'nofollow noopener noreferrer';
  a.title = `${src.title} — ${src.publisher}${src.date ? `, ${src.date}` : ''}`;
  a.append(label, el('span', 'sr-only', ' (source, opens in a new window)'));
  return a;
}

/** Renders inline text: **bold** and citation markers. */
function inline(parent: HTMLElement, text: string, meta: Meta | undefined, cited: Set<string>) {
  const srcs = new Map((meta?.sources ?? []).map((s) => [s.id, s]));
  const pages = new Map((meta?.pages ?? []).map((p) => [p.id, p.title]));
  const re = new RegExp(`\\*\\*([^*]+)\\*\\*|${MARKER.source}`, 'g');
  let last = 0;
  let prevMarker = '';
  for (const m of text.matchAll(re)) {
    const before = text.slice(last, m.index);
    if (before) parent.append(before);
    if (before.trim()) prevMarker = '';
    last = (m.index ?? 0) + m[0].length;
    if (m[1] !== undefined) {
      parent.append(el('strong', undefined, m[1]));
      prevMarker = '';
      continue;
    }
    if (m[0] === prevMarker) continue; // the same citation twice in a row
    prevMarker = m[0];
    const [kind, id, secs] = [m[2], m[3], m[4]];
    if (kind === 'src' && srcs.has(id)) {
      parent.append(' ', sourceLink(srcs.get(id)!, secs ? Number(secs) : undefined));
      cited.add(id);
    } else if (kind === 'page' && pages.has(id)) {
      const a = el('a', 'chat-page');
      a.href = `#${id}`;
      a.append(`${pages.get(id)}`, el('span', 'sr-only', ' (section of this page)'));
      parent.append(' ', a);
      cited.add(`page:${id}`);
    }
    // Anything else (an id not in the allowlist) is dropped.
  }
  const rest = text.slice(last);
  if (rest) parent.append(rest);
}

/** Renders an answer into `box`. Returns the ids that were cited. */
function renderAnswer(box: HTMLElement, raw: string, meta: Meta | undefined, final: boolean): Set<string> {
  let text = normalizeMarkers(raw)
    .replace(/\r/g, '')
    .replace(/\[([^\]\n]{1,80})\]\((https?:[^)\s]+)\)/g, '$1') // markdown links -> their text
    .replace(/\[(\d{1,2})\]/g, '') // stray footnote numbers
    .replace(/^#{1,6}\s+/gm, '');
  if (!final) text = text.replace(/\[[^\]\n]{0,60}$/, ''); // a marker still arriving
  const cited = new Set<string>();
  box.replaceChildren();
  for (const block of text.trim().split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    let list: HTMLUListElement | null = null;
    let para: string[] = [];
    const flush = () => {
      if (!para.length) return;
      const p = el('p');
      inline(p, para.join(' '), meta, cited);
      box.append(p);
      para = [];
    };
    for (const line of lines) {
      const item = /^(?:[-*•]|\d{1,2}[.)])\s+(.*)$/.exec(line);
      if (item) {
        flush();
        if (!list) {
          list = el('ul');
          box.append(list);
        }
        const li = el('li');
        inline(li, item[1], meta, cited);
        list.append(li);
      } else {
        list = null;
        para.push(line);
      }
    }
    flush();
  }
  return cited;
}

const plain = (s: string) => normalizeMarkers(s).replace(MARKER, '').replace(/\*\*/g, '').replace(/\s{2,}/g, ' ').trim();

export function initChat() {
  const root = document.getElementById('chat-root');
  const dialog = root?.querySelector<HTMLDialogElement>('dialog');
  if (!root || !dialog || typeof dialog.showModal !== 'function') return;

  const endpoint = root.dataset.endpoint || '/api/chat';
  const contact = root.dataset.contact || '';
  const log = dialog.querySelector<HTMLElement>('[data-chat-log]')!;
  const suggest = dialog.querySelector<HTMLElement>('[data-chat-suggest]')!;
  const form = dialog.querySelector<HTMLFormElement>('[data-chat-form]')!;
  const input = form.querySelector('textarea')!;
  const sendBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const status = dialog.querySelector<HTMLElement>('[data-chat-status]')!;
  const live = dialog.querySelector<HTMLElement>('[data-chat-live]')!;
  const resetBtn = dialog.querySelector<HTMLButtonElement>('[data-chat-reset]')!;

  let turns = store.load();
  let busy = false;
  let controller: AbortController | undefined;
  let generation = 0; // bumped by "Start over" so a late answer isn't added to the new conversation

  root.hidden = false;
  document.documentElement.classList.add('chat-ready');

  const setStatus = (s: string) => {
    status.textContent = s;
    status.hidden = !s;
  };
  const announce = (s: string) => {
    live.textContent = '';
    window.setTimeout(() => (live.textContent = s), 50);
  };
  const scrollDown = () => (log.scrollTop = log.scrollHeight);

  function addUser(text: string) {
    const m = el('div', 'chat-msg user');
    m.append(el('span', 'sr-only', 'You asked: '), el('p', undefined, text));
    log.append(m);
  }

  function addBot(turn: Turn): HTMLElement {
    const m = el('div', `chat-msg bot${turn.error ? ' error' : ''}`);
    const label = el('span', 'sr-only', 'Assistant: ');
    const body = el('div', 'chat-body');
    m.append(label, body);
    log.append(m);
    if (turn.content) finishBot(m, body, turn);
    return m;
  }

  function finishBot(m: HTMLElement, body: HTMLElement, turn: Turn) {
    if (turn.error) {
      body.replaceChildren(el('p', undefined, turn.content));
      return new Set<string>();
    }
    const cited = renderAnswer(body, turn.content, turn.meta, true);
    if (turn.meta?.status === 'answer' && !cited.size) {
      m.append(el('p', 'chat-note', 'This answer didn’t cite a source, so please double-check it against the page.'));
    }
    return cited;
  }

  function renderAll() {
    log.querySelectorAll('.chat-msg:not(.chat-intro)').forEach((n) => n.remove());
    suggest.hidden = turns.length > 0;
    resetBtn.hidden = turns.length === 0;
    for (const t of turns) (t.role === 'user' ? addUser(t.content) : addBot(t));
    scrollDown();
  }

  function open(from: string) {
    if (!dialog!.open) {
      dialog!.showModal();
      send('chat_open', { from });
    }
    scrollDown();
    input.focus();
  }

  async function ask(question: string, suggested = false) {
    question = question.replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!question || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    autosize();
    suggest.hidden = true;
    resetBtn.hidden = false;

    const gen = generation;
    const history = turns.filter((t) => !t.error).map(({ role, content }) => ({ role, content }));
    turns.push({ role: 'user', content: question });
    addUser(question);
    const turn: Turn = { role: 'assistant', content: '' };
    const m = addBot(turn);
    const body = m.querySelector<HTMLElement>('.chat-body')!;
    body.setAttribute('aria-busy', 'true');
    m.classList.add('pending');
    scrollDown();
    setStatus('Searching the sources…');
    announce('Searching the sources.');
    send('chat_question', { turn: turns.filter((t) => t.role === 'user').length, suggested });

    const started = performance.now();
    let meta: Meta | undefined;
    let text = '';
    let finished = false;
    let frame = 0;
    const paint = () => {
      frame = 0;
      renderAnswer(body, text, meta, false);
      scrollDown();
    };

    const fail = (message: string, reason: string) => {
      turn.content = message;
      turn.error = true;
      m.classList.add('error');
      send('chat_error', { reason });
    };

    try {
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 60_000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [...history, { role: 'user', content: question }] }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        window.clearTimeout(timeout);
        if (res.status === 429) fail('You’ve asked a lot of questions in a short time. Please wait a minute and try again.', 'rate_limited');
        else if (res.status === 413) fail('This conversation is getting long. Select “Start over” to ask something new.', 'too_long');
        else
          fail(
            `The assistant isn’t available right now. You can still read the page${contact ? `, or email ${contact}` : ''}.`,
            `http_${res.status}`,
          );
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true }).replace(/\r/g, '');
          let cut: number;
          while ((cut = buf.indexOf('\n\n')) >= 0) {
            const raw = buf.slice(0, cut);
            buf = buf.slice(cut + 2);
            let event = 'message';
            const data: string[] = [];
            for (const line of raw.split('\n')) {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
            }
            const payload = data.join('\n');
            if (!payload) continue;
            if (event === 'meta') {
              try {
                meta = JSON.parse(payload);
              } catch {
                /* ignore */
              }
              if (meta?.status === 'answer') setStatus('Writing an answer…');
              continue;
            }
            if (payload === '[DONE]') {
              finished = true;
              continue;
            }
            try {
              const o = JSON.parse(payload);
              const piece = typeof o.response === 'string' ? o.response : (o.choices?.[0]?.delta?.content ?? '');
              if (piece) {
                text += piece;
                if (status.textContent) setStatus('');
                if (!frame) frame = requestAnimationFrame(paint);
              }
            } catch {
              /* ignore keep-alives and partial lines */
            }
          }
        }
        window.clearTimeout(timeout);
        if (frame) cancelAnimationFrame(frame);
        turn.content = text.trim();
        turn.meta = meta;
        if (!turn.content) fail('Sorry, I couldn’t write an answer to that. Please try asking another way.', 'empty');
        else if (!finished) {
          turn.content += '\n\n(The answer was cut off. Please try again.)';
          send('chat_error', { reason: 'cut_off' });
        }
      }
    } catch (err) {
      fail(
        `The assistant couldn’t be reached. Check your connection and try again${contact ? `, or email ${contact}` : ''}.`,
        (err as Error)?.name === 'AbortError' ? 'timeout' : 'network',
      );
    }

    busy = false;
    sendBtn.disabled = false;
    controller = undefined;
    if (gen !== generation) return; // the visitor started over while this was loading
    setStatus('');
    body.removeAttribute('aria-busy');
    m.classList.remove('pending');
    const cited = finishBot(m, body, turn);
    turns.push(turn);
    store.save(turns);
    if (!turn.error) {
      send('chat_answer', {
        status: meta?.status ?? 'unknown',
        sources_cited: [...cited].filter((c) => !c.startsWith('page:')).length,
        seconds: Math.round((performance.now() - started) / 100) / 10,
      });
    }
    announce(`${turn.error ? '' : 'Answer: '}${plain(turn.content)}`);
    scrollDown();
    if (dialog!.open) input.focus();
  }

  function autosize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  }

  renderAll();

  // ----- Events -----
  document.addEventListener('click', (e) => {
    const opener = (e.target as Element | null)?.closest<HTMLElement>('[data-chat-open]');
    if (opener) {
      e.preventDefault();
      open(opener.dataset.chatFrom || 'link');
    }
  });
  dialog.querySelector('[data-chat-close]')!.addEventListener('click', () => dialog.close());
  // Clicking the dimmed backdrop closes the dialog.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  // A link to a section of the page closes the dialog so the page can scroll to it.
  log.addEventListener('click', (e) => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a.chat-page');
    if (a) dialog.close();
  });
  suggest.addEventListener('click', (e) => {
    const b = (e.target as Element | null)?.closest('button');
    if (b) ask(b.textContent ?? '', true);
  });
  resetBtn.addEventListener('click', () => {
    generation += 1;
    controller?.abort();
    setStatus('');
    turns = [];
    store.save(turns);
    renderAll();
    send('chat_reset', {});
    input.focus();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ask(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      ask(input.value);
    }
  });
  input.addEventListener('input', autosize);
}
