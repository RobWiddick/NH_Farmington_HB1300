// Sends GA4 events that show where people are on the page and what they read.
//
//   section_view   once per section, after it has been on screen for 1.5s
//   section_read   once per section, after 10s of total time on screen
//   source_click   a citation link was opened
//   faq_open       an FAQ question was expanded
//   share          a share link was used
//   nav_click      a top-bar or button link to a section was used
//
// Every event carries section_id / section_title so reports can be broken
// down by section (register them as event-scoped custom dimensions in GA4).

type Params = Record<string, string | number | boolean>;

const VIEW_DWELL_MS = 1500;
const READ_TOTAL_MS = 10_000;

function send(name: string, params: Params) {
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === 'function') gtag('event', name, params);
}

interface SectionState {
  el: HTMLElement;
  id: string;
  title: string;
  index: number;
  inView: boolean;
  enteredAt: number;
  totalMs: number;
  dwellTimer?: number;
  readTimer?: number;
  viewed: boolean;
  read: boolean;
}

function sectionTitle(el: HTMLElement): string {
  const heading = el.querySelector('h1, h2');
  return (heading?.textContent ?? el.id).replace(/\s+/g, ' ').trim().slice(0, 100);
}

function sectionOf(node: Element | null): { section_id: string; section_title: string } {
  const el = node?.closest('main section[id]') as HTMLElement | null;
  if (el) return { section_id: el.id, section_title: sectionTitle(el) };
  const area = node?.closest('header') ? 'header' : node?.closest('footer') ? 'footer' : '(none)';
  return { section_id: area, section_title: area };
}

function trackSections() {
  const els = Array.from(document.querySelectorAll<HTMLElement>('main section[id]'));
  const states = new Map<Element, SectionState>();
  let viewedCount = 0;

  els.forEach((el, index) =>
    states.set(el, {
      el,
      id: el.id,
      title: sectionTitle(el),
      index: index + 1,
      inView: false,
      enteredAt: 0,
      totalMs: 0,
      viewed: false,
      read: false,
    }),
  );

  const base = (s: SectionState): Params => ({
    section_id: s.id,
    section_title: s.title,
    section_index: s.index,
    section_count: els.length,
  });

  const stop = (s: SectionState) => {
    if (!s.inView) return;
    s.totalMs += performance.now() - s.enteredAt;
    s.inView = false;
    window.clearTimeout(s.dwellTimer);
    window.clearTimeout(s.readTimer);
  };

  const start = (s: SectionState) => {
    if (s.inView || document.visibilityState !== 'visible') return;
    s.inView = true;
    s.enteredAt = performance.now();
    if (!s.viewed) {
      s.dwellTimer = window.setTimeout(() => {
        s.viewed = true;
        viewedCount += 1;
        send('section_view', { ...base(s), sections_viewed: viewedCount });
      }, VIEW_DWELL_MS);
    }
    if (!s.read) {
      s.readTimer = window.setTimeout(() => {
        s.read = true;
        send('section_read', { ...base(s), seconds_on_screen: Math.round(READ_TOTAL_MS / 1000) });
      }, Math.max(0, READ_TOTAL_MS - s.totalMs));
    }
  };

  // A section counts as "on screen" while it covers the reading zone: the
  // middle fifth of the viewport. This works the same for short sections and
  // for sections taller than the screen.
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const s = states.get(entry.target);
        if (!s) continue;
        if (entry.isIntersecting) start(s);
        else stop(s);
      }
    },
    { rootMargin: '-40% 0px -40% 0px', threshold: 0 },
  );
  els.forEach((el) => io.observe(el));

  // Pause the clocks while the tab is hidden; resume sections still on screen.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      io.disconnect();
      els.forEach((el) => io.observe(el));
    } else {
      states.forEach(stop);
    }
  });
}

function trackClicks() {
  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest('a');
    if (!link) return;
    const href = link.getAttribute('href') ?? '';
    const text = (link.textContent ?? '').replace(/\s*\(.*?opens in a new window\)\s*/i, '').replace(/\s+/g, ' ').trim();
    const where = sectionOf(link);

    if (link.classList.contains('cite') || link.closest('.sources')) {
      let domain = '';
      try {
        domain = new URL(link.href).hostname;
      } catch {
        /* ignore */
      }
      send('source_click', { ...where, source_label: text.slice(0, 100), link_url: link.href, link_domain: domain });
    } else if (link.closest('.share')) {
      send('share', { ...where, method: text.toLowerCase(), content_type: 'page', item_id: location.pathname });
    } else if (href.startsWith('#') && href.length > 1) {
      send('nav_click', { ...where, link_text: text.slice(0, 100), target_section: href.slice(1) });
    }
  });

  document.querySelectorAll('details').forEach((d) => {
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      const q = d.querySelector('summary')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      send('faq_open', { ...sectionOf(d), faq_question: q.slice(0, 100) });
    });
  });
}

export function initAnalytics() {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return;
  if (!('IntersectionObserver' in window)) return;
  trackSections();
  trackClicks();
}
