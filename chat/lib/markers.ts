// Citation markers the answer model writes: [src:id], [src:id@seconds] and [page:id].
// Models sometimes add spaces ("[ src: id ]"), put several in one bracket
// ("[src:a, src:b]" or "[src:a, b]"), mix the kinds ("[src:page:top]"), or use
// CJK-style brackets and colons ("【src:id】", "［page：top］").
// normalizeMarkers() rewrites those into the canonical form so they render as
// links; anything it can't read is dropped.
export const MARKER = /\[(src|page):([a-z0-9-]+)(?:@(\d{1,5}))?\]/g;

export function normalizeMarkers(text: string): string {
  return text
    .replace(/[【［〔]\s*((?:src|page)\s*[:：][^】］〕\n]{1,200})[】］〕]/gi, (_w, inner: string) => `[${inner.replace(/：/g, ':')}]`)
    .replace(/\[\s*((?:src|page)\s*:[^\]\n]{1,200})\]/gi, (_whole, inner: string) => {
      let kind = '';
      return inner
        .split(/\s*[,;]\s*/)
        .map((part) => {
          const m = /^(?:(src|page)\s*:\s*)?(?:(src|page)\s*:\s*)?([a-z0-9-]+)\s*(?:@\s*(\d{1,5})s?)?$/i.exec(part.trim());
          if (!m) return '';
          kind = (m[2] || m[1] || kind).toLowerCase();
          if (!kind) return '';
          return `[${kind}:${m[3].toLowerCase()}${m[4] ? `@${m[4]}` : ''}]`;
        })
        .filter(Boolean)
        .join(' ');
    });
}
