// Election Day calendar reminder, linked from the "How to vote" section.
// Built as a static file at /vote-question-2.ics.
import type { APIRoute } from 'astro';
import { site, calendarEvent } from '../data/site';

// iCalendar text: escape \ ; , and newlines, and fold lines at 75 octets.
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
    }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export const GET: APIRoute = ({ site: siteUrl }) => {
  const day = (iso: string) => iso.replaceAll('-', '');
  const url = new URL('/', siteUrl).toString();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//${new URL(url).hostname}//Question 2 reminder//EN`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:election-${site.electionDateISO}@${new URL(url).hostname}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART;VALUE=DATE:${day(site.electionDateISO)}`,
    `DTEND;VALUE=DATE:${day(calendarEvent.endISO)}`,
    `SUMMARY:${esc(calendarEvent.title)}`,
    `DESCRIPTION:${esc(`${calendarEvent.details}\n\n${url}`)}`,
    `URL:${url}`,
    'TRANSP:TRANSPARENT',
    // A reminder at 9 a.m. the day before (15 hours before the all-day event starts).
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT15H',
    `DESCRIPTION:${esc('Tomorrow is Election Day. Question 2 is on the back of the ballot.')}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8' },
  });
};
