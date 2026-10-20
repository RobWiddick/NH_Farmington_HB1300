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
  research: 'Independent research and polling',
  'advocacy-con': 'Groups that oppose the cap (labeled so you can weigh them)',
  'advocacy-pro': 'Groups and officials that support the cap (labeled so you can weigh them)',
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
  // ---------- The law ----------
  'hb1300-text': {
    short: 'HB 1300 text',
    title: 'HB 1300, Chapter 324 (final version as signed)',
    publisher: 'New Hampshire General Court',
    url: 'https://gc.nh.gov/bill_status/legacy/bs2016/billText.aspx?sy=2026&id=2080&txtFormat=html&v=current',
    date: 'approved July 15, 2026',
    kind: 'law',
  },
  'rsa-32-5-i': {
    short: 'RSA 32:5-i',
    title: 'RSA 32:5-i, School District Local Tax Cap and SAU Fixed Cap (the law HB 1300 created)',
    publisher: 'New Hampshire General Court',
    url: 'https://gc.nh.gov/rsa/html/III/32/32-5-i.htm',
    kind: 'law',
  },
  'hb1300-status': {
    short: 'Bill history',
    title: 'HB 1300 (2026) bill status, roll-call votes, and text versions',
    publisher: 'New Hampshire General Court',
    url: 'https://gc.nh.gov/bill_status/billinfo.aspx?id=2080&inflect=2',
    kind: 'law',
  },
  'hb1300-fiscal-note': {
    short: 'Fiscal note',
    title: 'HB 1300 as amended by the Senate, with fiscal note',
    publisher: 'NH Office of Legislative Budget Assistant',
    url: 'https://gc.nh.gov/bill_status/legacy/bs2016/billText.aspx?sy=2026&id=2080&txtFormat=html&v=SA',
    date: 'May 27, 2026',
    kind: 'law',
  },
  'rsa-32-5-b': {
    short: 'RSA 32:5-b',
    title: 'RSA 32:5-b, existing local tax caps (adjusts for population or enrollment)',
    publisher: 'New Hampshire General Court',
    url: 'https://gc.nh.gov/rsa/html/III/32/32-5-b.htm',
    kind: 'law',
  },

  // ---------- Government data ----------
  'bls-cpi-ne': {
    short: 'BLS Northeast CPI',
    title: 'Consumer Price Index for All Urban Consumers, Northeast region (series CUUR0100SA0)',
    publisher: 'U.S. Bureau of Labor Statistics',
    url: 'https://data.bls.gov/timeseries/CUUR0100SA0',
    kind: 'data',
  },

  // ---------- Courts ----------
  'bates-complaint': {
    short: 'Lawsuit filing',
    title: 'Bates & Wieser v. Scanlan, complaint (plaintiffs’ allegations)',
    publisher: 'Merrimack County Superior Court, No. 217-2026-CV-00671 (copy published by NHPR)',
    url: 'https://npr.brightspotcdn.com/27/d7/9f326a65465697a752e418b11708/complaint-for-declaratory-and-emergency-injunctive-relief-8-31-2026.pdf',
    date: 'Aug. 31, 2026',
    kind: 'court',
  },
  'superior-order': {
    short: 'Court order',
    title: 'Order on motion for preliminary injunctive relief (Judge St. Hilaire)',
    publisher: 'Merrimack County Superior Court (copy published by NHPR)',
    url: 'https://npr.brightspotcdn.com/fc/fa/e14cc7c8487c894d257ea20c7a02/court-order-09-15-26.pdf',
    date: 'Sept. 16, 2026',
    kind: 'court',
  },
  'nhsc-order-0917': {
    short: 'NH Supreme Court',
    title: 'Petition of David Bates & a., No. 2026-0612: emergency motion denied',
    publisher: 'New Hampshire Supreme Court (copy published by NHPR)',
    url: 'https://npr.brightspotcdn.com/83/2a/db9d12234c2f992b184d750bf427/petition-of-david-bates-and-kelly-wieser.pdf',
    date: 'Sept. 17, 2026',
    kind: 'court',
  },

  // ---------- Farmington ----------
  'farmington-sample-ballot': {
    short: 'Farmington sample ballot',
    title: 'Farmington General Election, November 3, 2026 — sample ballot',
    publisher: 'Town of Farmington, NH',
    url: 'https://www.farmington.nh.us/DocumentCenter/View/3121',
    kind: 'local',
  },
  'farmington-clerk': {
    short: 'Town Clerk',
    title: 'Town Clerk / Tax Collector (elections, sample ballot, absentee ballots)',
    publisher: 'Town of Farmington, NH',
    url: 'https://www.farmington.nh.us/1206/Town-Clerk-Tax-Collector',
    kind: 'local',
  },
  'school-board-video': {
    short: 'School Board video',
    title: '10-19-26 Farmington NH School Board Meeting (HB 1300 presentation begins around 36:00)',
    publisher: 'FSDTV 25 (YouTube)',
    url: 'https://www.youtube.com/watch?v=qcF6xnfGMWc&t=2160s',
    date: 'Oct. 19, 2026',
    kind: 'local',
  },

  // ---------- News ----------
  'nhb-howitworks': {
    short: 'NH Bulletin',
    title: 'A new law puts school district tax caps on the November ballot. Here’s how it works.',
    publisher: 'New Hampshire Bulletin (Ethan DeWitt)',
    url: 'https://newhampshirebulletin.com/2026/07/17/a-new-law-puts-school-district-tax-caps-on-the-november-ballot-heres-how-it-works/',
    date: 'July 17, 2026',
    kind: 'news',
  },
  'nhb-lawsuit': {
    short: 'NH Bulletin',
    title: 'Lawsuit seeks to strike down tax-cap ballot question before November',
    publisher: 'New Hampshire Bulletin (Ethan DeWitt)',
    url: 'https://newhampshirebulletin.com/2026/09/02/lawsuit-seeks-to-strike-down-tax-cap-ballot-question-before-november/',
    date: 'Sept. 2, 2026',
    kind: 'news',
  },
  'nhb-origin': {
    short: 'NH Bulletin',
    title: 'House Republicans push new property tax cap proposal; local officials object',
    publisher: 'New Hampshire Bulletin (Ethan DeWitt)',
    url: 'https://newhampshirebulletin.com/2026/01/21/house-republicans-push-new-property-tax-cap-proposal-local-officials-object/',
    date: 'Jan. 21, 2026',
    kind: 'news',
  },
  'nhpr-explainer': {
    short: 'NHPR',
    title: 'There is a school tax cap question on your ballot this year. Here’s what it means.',
    publisher: 'New Hampshire Public Radio (Annmarie Timmins)',
    url: 'https://www.nhpr.org/politics/2026-10-01/school-tax-cap-ballot-question-nh-midterm-election-2026',
    date: 'Oct. 1, 2026',
    kind: 'news',
  },
  'nhpr-cuts': {
    short: 'NHPR',
    title: 'NH school leaders predict budget cuts under tax cap ballot question',
    publisher: 'New Hampshire Public Radio (Annmarie Timmins)',
    url: 'https://www.nhpr.org/education/2026-10-14/school-tax-cap-budget-cuts-inflation-education-ballot',
    date: 'Oct. 14, 2026',
    kind: 'news',
  },
  'nhpr-court': {
    short: 'NHPR',
    title: 'Court upholds school tax cap question that will be on NH ballots',
    publisher: 'New Hampshire Public Radio (Annmarie Timmins)',
    url: 'https://www.nhpr.org/education/2026-09-28/school-tax-cap-lawsuit-supreme-court-education-ballot',
    date: 'Sept. 28, 2026',
    kind: 'news',
  },
  'indepthnh-supreme': {
    short: 'InDepthNH',
    title: 'Supreme Court Clears Way for School Budget Cap Question',
    publisher: 'InDepthNH (Garry Rayno)',
    url: 'https://indepthnh.org/2026/09/29/supreme-court-clears-way-for-school-budget-cap-question/',
    date: 'Sept. 29, 2026',
    kind: 'news',
  },
  'keene-innis': {
    short: 'Keene Sentinel',
    title: 'NH public education advocates call out ballot question confusion',
    publisher: 'The Keene Sentinel (Rick Green)',
    url: 'https://www.keenesentinel.com/news/local/lengthy-school-budget-tax-cap-question-goes-on-nh-ballot-2026/article_6681c067-9c33-4b72-a54e-ed5b374f8019.html',
    date: 'July 23, 2026',
    kind: 'news',
  },
  'vnews-wording': {
    short: 'Valley News',
    title: 'School boards call tax cap ballot wording misleading; lawmaker says it’s accurate',
    publisher: 'Valley News (Molly Hughes)',
    url: 'https://vnews.com/2026/10/15/lebanon-school-board-opposes-tax-cap-question/',
    date: 'Oct. 15, 2026',
    kind: 'news',
  },
  'monitor-confusion': {
    short: 'Concord Monitor',
    title: 'School tax cap question sparks worry, hope and confusion as election draws closer',
    publisher: 'Concord Monitor (Yasmeen Saadi)',
    url: 'https://www.concordmonitor.com/2026/10/20/school-tax-cap-question-sparks-worry-hope-and-confusion-as-election-draws-closer/',
    date: 'Oct. 20, 2026',
    kind: 'news',
  },
  'nhjournal-poll': {
    short: 'NH Journal',
    title: 'Granite Staters Support GOP-Backed Tax Cap Vote, Survey Finds',
    publisher: 'NH Journal (Michael Graham)',
    url: 'https://nhjournal.com/tax-relief-and-turnout-nh-gop-sees-opportunity-in-cap-vote/',
    date: 'Sept. 2026',
    kind: 'news',
  },

  // ---------- Research / polling ----------
  'unh-poll': {
    short: 'UNH poll',
    title: 'Granite State Poll: HB 1300 school tax cap question',
    publisher: 'UNH Survey Center',
    url: 'https://scholars.unh.edu/survey_center_polls/1005/',
    date: 'Sept. 24, 2026',
    kind: 'research',
  },

  // ---------- Advocacy ----------
  'rhnh-explainer': {
    short: 'Reaching Higher NH',
    title: 'What this Means: HB 1300',
    publisher: 'Reaching Higher NH (public-education policy group)',
    url: 'https://www.reachinghighernh.org/content-item/552/what-this-means-hb-1300',
    date: 'May 29, 2026',
    kind: 'advocacy-con',
  },
  'housegop-signing': {
    short: 'NH House Republicans',
    title: 'House Republicans applaud Gov. Ayotte for signing Taxpayer Protection Act',
    publisher: 'New Hampshire House Republican Caucus',
    url: 'https://www.nhhousegop.com/?p=10278',
    date: 'July 2026',
    kind: 'advocacy-pro',
  },
});

export type SourceId = keyof typeof sources;
