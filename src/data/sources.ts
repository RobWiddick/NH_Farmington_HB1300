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

  'nhpr-rejected': {
    short: 'NHPR',
    title: '9 NH towns reject tax caps as lawmakers push towns to consider them',
    publisher: 'New Hampshire Public Radio (Dan Tuohy)',
    url: 'https://www.nhpr.org/nh-news/2026-03-12/9-nh-towns-school-districts-reject-tax-caps-town-meeting',
    date: 'March 12, 2026',
    kind: 'news',
  },
  'monitor-caps-2025': {
    short: 'Concord Monitor',
    title: 'Data: Local school spending caps proved universally unpopular',
    publisher: 'Concord Monitor (Jeremy Margolis)',
    url: 'https://concordmonitor.com/School-budget-caps-New-Hampshire-state-legislature-60099913',
    date: 'March 23, 2025',
    kind: 'news',
  },
  'nhb-hb675': {
    short: 'NH Bulletin',
    title: 'In dramatic reversal, House kills school district budget cap bill',
    publisher: 'New Hampshire Bulletin (Ethan DeWitt)',
    url: 'https://newhampshirebulletin.com/2026/01/08/in-dramatic-reversal-house-kills-school-district-budget-cap-bill/',
    date: 'Jan. 8, 2026',
    kind: 'news',
  },
  'monitor-franklin': {
    short: 'Concord Monitor',
    title: 'Franklin School Board proposes budget exceeding tax cap to save positions, programs',
    publisher: 'Concord Monitor (Emilia Wisniewski)',
    url: 'https://www.concordmonitor.com/2026/06/04/franklin-school-budget-cuts-programs-staff/',
    date: 'June 4, 2026',
    kind: 'news',
  },
  'nhb-state-share': {
    short: 'NH Bulletin',
    title: 'Report: New Hampshire’s public school state spending levels lowest in U.S.',
    publisher: 'New Hampshire Bulletin (Ethan DeWitt)',
    url: 'https://newhampshirebulletin.com/2025/04/29/report-new-hampshires-public-school-state-spending-levels-lowest-in-u-s/',
    date: 'April 29, 2025',
    kind: 'news',
  },
  'keene-enrollment': {
    short: 'Keene Sentinel',
    title: 'Enrollment decline trend continues',
    publisher: 'The Keene Sentinel (Rick Green), quoting the NH Department of Education',
    url: 'https://www.keenesentinel.com/news/local/education/state-enrollment-decline-trend-continues/article_8b9eddf0-5e55-4be4-8c00-b5e28a253357.html',
    date: 'Nov. 19, 2025',
    kind: 'news',
  },

  // ---------- Nearby cities with caps ----------
  'rochester-workshop': {
    short: 'Rochester minutes',
    title: 'Committee of the Whole budget workshop with the School Board — minutes',
    publisher: 'City of Rochester, NH',
    url: 'https://www.rochesternh.gov/sites/g/files/vyhlif9211/f/minutes/cwbr20260526min.pdf',
    date: 'May 26, 2026',
    kind: 'data',
  },
  'rochester-adopted': {
    short: 'City of Rochester',
    title: 'City Council adopts FY27 city & school operating and capital improvement budgets',
    publisher: 'The Rochester Post (City of Rochester)',
    url: 'https://news.rochesternh.gov/city-council-adopts-fy27-city-school-operating-and-capital-improvement-budgets/',
    date: 'June 5, 2026',
    kind: 'data',
  },
  'rochester-below-cap': {
    short: 'City of Rochester',
    title: 'Rochester’s certified property taxation remains below allowable tax cap by $14.5 million',
    publisher: 'The Rochester Post (City of Rochester)',
    url: 'https://news.rochesternh.gov/rochesters-certified-property-taxation-remains-below-allowable-tax-cap-by-14-5-million',
    date: 'Jan. 21, 2025',
    kind: 'data',
  },
  'somersworth-workshop': {
    short: 'Somersworth minutes',
    title: 'Joint City Council and School Board budget workshop — minutes',
    publisher: 'City of Somersworth, NH',
    url: 'https://www.somersworthnh.gov/sites/g/files/vyhlif1226/f/minutes/february_3_2025_council_sb_minutes.pdf',
    date: 'Feb. 3, 2025',
    kind: 'data',
  },
  'dover-overrides': {
    short: 'City of Dover',
    title: 'Tax cap over-ride history, FY2009–FY2026',
    publisher: 'City of Dover, NH',
    url: 'https://www.dover.nh.gov/Assets/government/open-government/budget-revealed/FY2027-documents/citycouncil-documents/Tax%20Cap%20Over%20Ride%20History%20FY2009-FY2026.pdf',
    date: '2026',
    kind: 'data',
  },
  'ma-primer': {
    short: 'Mass. DOR',
    title: 'Levy Limits: A Primer on Proposition 2½',
    publisher: 'Massachusetts Department of Revenue, Division of Local Services',
    url: 'https://www.mass.gov/doc/levy-limits-a-primer-on-proposition-2-12-0/download',
    kind: 'data',
  },

  // ---------- Research / polling ----------
  'figlio-1997': {
    short: 'Figlio (1997)',
    title: 'Did the “tax revolt” reduce school performance? Journal of Public Economics 65(3)',
    publisher: 'David N. Figlio',
    url: 'https://doi.org/10.1016/s0047-2727(97)00015-7',
    date: '1997',
    kind: 'research',
  },
  'figlio-1998': {
    short: 'Figlio (1998)',
    title: 'Short-term effects of a 1990s-era property tax limit: Oregon’s Measure 5. National Tax Journal 51(1)',
    publisher: 'David N. Figlio',
    url: 'https://doi.org/10.1086/NTJ41789311',
    date: '1998',
    kind: 'research',
  },
  'ddm-1998': {
    short: 'Downes, Dye & McGuire (1998)',
    title: 'Do limits matter? Evidence on the effects of tax limitations on student performance. Journal of Urban Economics 43(3)',
    publisher: 'Thomas Downes, Richard Dye & Therese McGuire',
    url: 'https://doi.org/10.1006/juec.1997.2052',
    date: '1998',
    kind: 'research',
  },
  'rockinst-ny': {
    short: 'Rockefeller Institute',
    title: 'As Albany debates a permanent property tax cap, how is the cap affecting school budgets?',
    publisher: 'Rockefeller Institute of Government',
    url: 'https://rockinst.org/blog/as-albany-debates-a-permanent-property-tax-cap-how-is-the-cap-affecting-school-budgets/',
    date: 'Jan. 2019',
    kind: 'research',
  },
  'newamerica-nh': {
    short: 'New America',
    title: 'New Hampshire education funding overview (Census FY2023 data)',
    publisher: 'New America',
    url: 'https://www.newamerica.org/wp-content/uploads/2026/06/New-Hampshire-State-Education-Funding-Overview.pdf',
    date: 'June 2026',
    kind: 'research',
  },
  'newamerica-ma': {
    short: 'New America',
    title: 'Massachusetts education funding overview (Census FY2023 data)',
    publisher: 'New America',
    url: 'https://www.newamerica.org/wp-content/uploads/2026/06/Massachusetts-State-Education-Funding-Overview.pdf',
    date: 'June 2026',
    kind: 'research',
  },
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
  'nhfpi-proptax': {
    short: 'NHFPI',
    title: 'Property Taxes in New Hampshire: How They Work and How They Compare',
    publisher: 'New Hampshire Fiscal Policy Institute',
    url: 'https://nhfpi.org/resource/property-taxes-in-new-hampshire-how-they-work-and-how-they-compare/',
    date: 'April 9, 2026',
    kind: 'advocacy-con',
    note: 'Nonpartisan policy research group; figures are from the U.S. Census Bureau and NH Department of Revenue Administration',
  },
  'aftnh-testimony': {
    short: 'AFT-NH',
    title: 'Testimony in opposition to HB 1300',
    publisher: 'AFT-New Hampshire (teachers union)',
    url: 'https://nh.aft.org/state-house-news/aft-nh-testimony-opposition-hb-1300',
    date: '2026',
    kind: 'advocacy-con',
  },
  'jbc-spending': {
    short: 'Josiah Bartlett Center',
    title: 'Per-pupil spending in NH nearly doubles from 2001-2024 as district public schools spend $1.25 billion more on 54,000 fewer students',
    publisher: 'Josiah Bartlett Center for Public Policy (free-market think tank)',
    url: 'https://jbartlett.org/2025/06/per-pupil-spending-in-nh-nearly-doubles-from-2001-2024-as-district-public-schools-spend-1-25-billion-more-on-54000-fewer-students/',
    date: 'June 4, 2025',
    kind: 'advocacy-pro',
  },
  'jbc-massway': {
    short: 'Josiah Bartlett Center',
    title: 'Capping school district budget growth (and property taxes) the Massachusetts way',
    publisher: 'Josiah Bartlett Center for Public Policy (Andrew Cline)',
    url: 'https://jbartlett.org/2026/07/capping-school-district-budget-growth-and-property-taxes-the-massachusetts-way/',
    date: 'July 29, 2026',
    kind: 'advocacy-pro',
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
