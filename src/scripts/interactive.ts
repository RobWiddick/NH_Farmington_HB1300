// Small interactive pieces. Each one is server-rendered in a sensible default
// state, so the page reads the same without JavaScript; these scripts only add
// the controls.
//
// GA4 events (each also carries section_id / section_title):
//   calc_change { inflation, new_construction }  (debounced)
//   vote_slider { yes_pct }                      (debounced)
//   reveal_open { item }
//   calendar_add { method: 'ics' | 'google' }
//   chart_subject { subject: 'math' | 'ela' | 'sci' }
//   menu_open
import { send, sectionOf } from './analytics';

const money = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;

function debounce<T extends unknown[]>(fn: (...a: T) => void, ms: number) {
  let t: number | undefined;
  return (...a: T) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
}

/** "What would the cap allow?" (src/components/CapCalculator.astro) */
export function initCalculators() {
  document.querySelectorAll<HTMLElement>('[data-calc]').forEach((root) => {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const base = Number(root.dataset.base);
    const expected = Number(root.dataset.expected);
    const controls = root.querySelector<HTMLElement>('[data-calc-controls]');
    const infl = root.querySelector<HTMLInputElement>('[data-in="infl"]');
    const nc = root.querySelector<HTMLInputElement>('[data-in="nc"]');
    if (!controls || !infl || !nc) return;
    controls.hidden = false;
    const val = (k: string) => root.querySelector<HTMLElement>(`[data-val="${k}"]`);
    const bar = root.querySelector<HTMLElement>('[data-bar="allowed"]');
    const summary = root.querySelector<HTMLElement>('[data-summary]');
    const verdict = root.querySelector<HTMLElement>('[data-verdict]');
    const presets = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-preset]'));
    const report = debounce(
      (i: number, c: number) => send('calc_change', { ...sectionOf(root), inflation: i, new_construction: c }),
      1200,
    );
    const inputs: Record<string, HTMLInputElement> = { infl, nc };
    // Typed values: ignore anything that isn't a number, and keep to the field's range.
    const read = (el: HTMLInputElement) => {
      const n = Number.parseFloat(el.value.replace(',', '.'));
      const min = Number(el.min || 0);
      const max = Number(el.max || 100);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 10) / 10)) : min;
    };

    const update = (fromUser: boolean) => {
      const i = read(infl);
      const c = read(nc);
      const allowed = base * ((i + c) / 100);
      const gap = expected - allowed;
      val('allowed')!.textContent = money(allowed);
      if (bar) bar.style.width = `${Math.min(100, (allowed / expected) * 100).toFixed(1)}%`;
      val('gap')!.textContent = money(gap);
      val('gap-label')!.textContent = gap > 0 ? ' short in year one' : ' to spare in year one';
      verdict?.classList.toggle('ok', gap <= 0);
      presets.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.preset) === i)));
      if (summary && fromUser)
        summary.textContent = `At ${i.toFixed(1)}% inflation and ${c.toFixed(1)}% new construction, the cap would allow about ${money(allowed)} more, against ${money(expected)} in expected increases: ${gap > 0 ? `about ${money(gap)} short` : `about ${money(gap)} to spare`}.`;
      if (fromUser) report(i, c);
    };
    for (const el of [infl, nc]) {
      el.addEventListener('input', () => update(true));
      // Tidy the field (clamp, one decimal) once the visitor is done typing.
      el.addEventListener('change', () => {
        el.value = read(el).toFixed(1);
        update(true);
      });
    }
    root.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((b) =>
      b.addEventListener('click', () => {
        const el = inputs[b.dataset.step ?? ''];
        if (!el) return;
        el.value = (read(el) + Number(b.dataset.delta)).toFixed(1);
        el.value = read(el).toFixed(1);
        update(true);
      }),
    );
    presets.forEach((b) =>
      b.addEventListener('click', () => {
        infl.value = Number(b.dataset.preset).toFixed(1);
        update(true);
      }),
    );
    update(false);
  });
}

/** "If X% vote yes" slider over the 100-dot grid (src/components/VoteSlider.astro) */
export function initVoteSliders() {
  document.querySelectorAll<HTMLElement>('[data-vote]').forEach((root) => {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const input = root.querySelector<HTMLInputElement>('input[type="range"]');
    const controls = root.querySelector<HTMLElement>('[data-vote-controls]');
    const dots = Array.from(root.querySelectorAll<SVGCircleElement>('circle'));
    const yesOut = root.querySelector<HTMLElement>('[data-out="yes"]');
    const noOut = root.querySelector<HTMLElement>('[data-out="no"]');
    const majority = root.querySelector<HTMLElement>('[data-result="majority"]');
    const cap = root.querySelector<HTMLElement>('[data-result="cap"]');
    const svg = root.querySelector('svg');
    if (!input || !controls) return;
    controls.hidden = false;
    const report = debounce((y: number) => send('vote_slider', { ...sectionOf(root), yes_pct: y }), 1200);
    const set = (el: HTMLElement | null, pass: boolean) => {
      if (!el) return;
      el.textContent = pass ? 'Passes' : 'Fails';
      el.classList.toggle('pass', pass);
      el.classList.toggle('fail', !pass);
    };
    const update = (fromUser: boolean) => {
      const yes = Number(input.value);
      dots.forEach((d, i) => d.setAttribute('class', i < yes ? 'yes' : 'no'));
      if (yesOut) yesOut.textContent = String(yes);
      if (noOut) noOut.textContent = String(100 - yes);
      set(majority, yes > 50);
      set(cap, yes >= 60);
      svg?.setAttribute('aria-label', `100 dots: ${yes} voters vote yes on a school budget, ${100 - yes} vote no.`);
      input.setAttribute('aria-valuetext', `${yes} yes, ${100 - yes} no`);
      if (fromUser) report(yes);
    };
    input.addEventListener('input', () => update(true));
    root.querySelectorAll<HTMLButtonElement>('[data-vote-step]').forEach((b) =>
      b.addEventListener('click', () => {
        input.value = String(Math.min(100, Math.max(0, Number(input.value) + Number(b.dataset.voteStep))));
        update(true);
      }),
    );
    update(false);
  });
}

/**
 * "See what the law says" buttons (the ballot section). Panels are visible
 * without JavaScript. Where the browser supports hidden="until-found", a closed
 * panel can still be found with Find in page, which opens it.
 */
export function initReveals() {
  const findable = 'onbeforematch' in document.body;
  document.querySelectorAll<HTMLButtonElement>('[data-reveal]').forEach((btn) => {
    if (btn.dataset.ready) return;
    btn.dataset.ready = '1';
    const panel = document.getElementById(btn.getAttribute('aria-controls') ?? '');
    if (!panel) return;
    const label = btn.textContent?.trim() ?? '';
    const set = (open: boolean) => {
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? 'Hide what the law says' : label;
      if (open) panel.hidden = false;
      else if (findable) panel.setAttribute('hidden', 'until-found');
      else panel.hidden = true;
      btn.closest('.claim')?.classList.toggle('is-open', open);
      if (open) send('reveal_open', { ...sectionOf(btn), item: btn.dataset.reveal ?? '' });
    };
    btn.hidden = false;
    set(false);
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    panel.addEventListener('beforematch', () => set(true));
  });
}

/** Floating "Back to top" link (src/components/BackToTop.astro): shown once the hero has scrolled away. */
export function initBackToTop() {
  const link = document.querySelector<HTMLElement>('[data-to-top]');
  const hero = document.getElementById('top');
  if (!link || !hero || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(([e]) => link.classList.toggle('is-shown', !e.isIntersecting)).observe(hero);
}

/** "12 days to go" next to the election date, and calendar link tracking. */
export function initVoteDay() {
  document.querySelectorAll<HTMLElement>('[data-countdown]').forEach((el) => {
    const [y, m, d] = (el.dataset.countdown ?? '').split('-').map(Number);
    if (!y) return;
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
    el.textContent =
      days > 1 ? `${days} days to go` : days === 1 ? 'Tomorrow' : days === 0 ? 'Today is Election Day' : '';
    el.classList.toggle('is-today', days === 0);
  });
  document.querySelectorAll<HTMLAnchorElement>('[data-cal]').forEach((a) =>
    a.addEventListener('click', () => send('calendar_add', { ...sectionOf(a), method: a.dataset.cal ?? '' })),
  );
}

/** The top bar's "Sections" menu (src/components/SectionMenu.astro). */
export function initMenu() {
  const menu = document.querySelector<HTMLDetailsElement>('[data-menu]');
  if (!menu || menu.dataset.ready) return;
  menu.dataset.ready = '1';
  const links = Array.from(menu.querySelectorAll<HTMLAnchorElement>('[data-menu-link]'));
  const close = () => {
    menu.open = false;
  };
  // Mark the section at the top of the screen, so the open menu shows where you are.
  const markCurrent = () => {
    const y = 90;
    let current = '';
    for (const a of links) {
      const el = document.getElementById(a.hash.slice(1));
      if (el && el.getBoundingClientRect().top <= y) current = a.hash;
    }
    links.forEach((a) => (a.hash === current ? a.setAttribute('aria-current', 'location') : a.removeAttribute('aria-current')));
  };
  menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    markCurrent();
    send('menu_open', { ...sectionOf(menu) });
  });
  links.forEach((a) => a.addEventListener('click', close));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) {
      close();
      menu.querySelector('summary')?.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (menu.open && !menu.contains(e.target as Node)) close();
  });
}

/** Subject buttons for the test-score charts (src/components/ScoreChart.astro). */
export function initScoreCharts() {
  document.querySelectorAll<HTMLElement>('[data-scores]').forEach((root) => {
    if (root.dataset.ready) return;
    root.dataset.ready = '1';
    const controls = root.querySelector<HTMLElement>('[data-score-controls]');
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-score-subject]'));
    const charts = Array.from(root.querySelectorAll<HTMLElement>('[data-score-chart]'));
    if (!controls || !buttons.length) return;
    controls.hidden = false;
    const show = (key: string) => {
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scoreSubject === key)));
      charts.forEach((c) => (c.hidden = c.dataset.scoreChart !== key));
    };
    buttons.forEach((b) =>
      b.addEventListener('click', () => {
        show(b.dataset.scoreSubject ?? 'math');
        send('chart_subject', { ...sectionOf(root), subject: b.dataset.scoreSubject ?? '' });
      }),
    );
    show(buttons[0].dataset.scoreSubject ?? 'math');
  });
}
