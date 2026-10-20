// Every source cited on the site. Cite one next to a claim with <Cite id="..." />.
// kind controls how it is grouped in the sources list at the bottom of the page.

export type SourceKind =
  | 'law'
  | 'data'
  | 'court'
  | 'local'
  | 'news'
  | 'research'
  | 'advocacy-con'
  | 'advocacy-pro';

export const kindLabels: Record<SourceKind, string> = {
  law: 'The law itself',
  data: 'Government data',
  court: 'Court records',
  local: 'Farmington and SAU 61',
  news: 'News reporting',
  research: 'Independent research',
  'advocacy-con': 'Groups opposing the cap (labeled so you can weigh them)',
  'advocacy-pro': 'Groups supporting the cap (labeled so you can weigh them)',
};

export interface Source {
  /** Short label shown in the inline citation pill. */
  short: string;
  title: string;
  publisher: string;
  url: string;
  date?: string;
  kind: SourceKind;
  note?: string;
}

const defineSources = <T extends Record<string, Source>>(s: T) => s;

export const sources = defineSources({
  'hb1300-status': {
    short: 'NH Legislature',
    title: 'HB 1300 (2026) bill status, votes, and text versions',
    publisher: 'New Hampshire General Court',
    url: 'https://gc.nh.gov/bill_status/billinfo.aspx?id=2080&inflect=2',
    kind: 'law',
  },
});

export type SourceId = keyof typeof sources;
