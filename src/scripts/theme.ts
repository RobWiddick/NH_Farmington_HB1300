// Light/dark theme switch. The page follows the device setting until the visitor
// picks a theme; that choice is saved in localStorage and applied before first
// paint by the inline script in src/layouts/Base.astro (so there's no flash).
import { send } from './analytics';

type Theme = 'light' | 'dark';
const KEY = 'theme';
const COLORS: Record<Theme, string> = { light: '#14325c', dark: '#0f1420' };

const system = () => window.matchMedia('(prefers-color-scheme: dark)');

function saved(): Theme | null {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

const current = (): Theme =>
  (document.documentElement.dataset.theme as Theme | undefined) ?? (system().matches ? 'dark' : 'light');

function paint(buttons: HTMLButtonElement[]) {
  const theme = current();
  for (const b of buttons) {
    b.setAttribute('aria-pressed', String(theme === 'dark'));
    b.title = theme === 'dark' ? 'Dark mode is on. Switch to light mode' : 'Switch to dark mode';
  }
  // Keep the browser chrome (mobile address bar) in step with an explicit choice.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    if (!m.dataset.media) m.dataset.media = m.media;
    if (saved()) {
      m.content = COLORS[theme];
      m.media = '';
    } else {
      m.media = m.dataset.media;
      m.content = m.dataset.media.includes('dark') ? COLORS.dark : COLORS.light;
    }
  });
}

export function initTheme() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]'));
  if (!buttons.length) return;
  for (const b of buttons) {
    b.hidden = false;
    b.addEventListener('click', () => {
      const next: Theme = current() === 'dark' ? 'light' : 'dark';
      // Choosing the device's own theme clears the override, so the page keeps
      // following the device if its setting changes later.
      if (next === (system().matches ? 'dark' : 'light')) {
        delete document.documentElement.dataset.theme;
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* private mode: the choice just isn't remembered */
        }
      } else {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(KEY, next);
        } catch {
          /* private mode: the choice just isn't remembered */
        }
      }
      paint(buttons);
      send('theme_change', { theme: next });
    });
  }
  system().addEventListener('change', () => paint(buttons));
  paint(buttons);
}
