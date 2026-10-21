// Site-wide settings. Edit these before launch.
export const site = {
  title: 'Question 2 & Farmington Schools: NH HB 1300 tax cap',
  // The site's author. Shown in the hero ("I'm …") and footer ("Written by …").
  publisher: 'Brittni Widdick',
  shortTitle: 'Farmington: Question 2',
  description:
    'Why Brittni Widdick recommends No on Question 2: a plain-English, fully sourced look at the HB 1300 school tax cap and what it would mean for Farmington schools.',
  electionDate: 'Tuesday, November 3, 2026',
  electionDateShort: 'Vote Tuesday, Nov. 3',
  // Used for the countdown and the "Add to my calendar" links.
  electionDateISO: '2026-11-03',
  lastUpdated: 'October 20, 2026',
  // Optional "Paid for by" line shown in the footer. Left empty: RSA 664:14, V
  // exempts "a lone individual who independently authors, produces, and
  // distributes political advertising." Fill this in if that stops being true
  // (e.g. a committee or organization takes over the site).
  disclosure: '',
  // Footer contact for corrections, press, etc. Visitors are asked to try the chat assistant first.
  contactEmail: 'hi@hb1300.com',
  // The "Ask a question" assistant (functions/api/chat.ts). Set enabled: false to remove it from the page.
  chat: {
    enabled: true,
    endpoint: '/api/chat',
  },
  // Google Analytics 4 measurement ID. Set to '' to turn analytics off.
  ga4Id: 'G-HDL10H5ND4',
  shareText: 'Before you vote on Question 2, read what it really does to Farmington schools:',
};

// Election Day reminder: an all-day event, in the .ics file (src/pages/vote-question-2.ics.ts)
// and the Google Calendar link in the "How to vote" section.
export const calendarEvent = {
  title: 'Vote: Question 2 is on the back of the ballot',
  details:
    'Flip your ballot over: Question 2, the school tax cap (HB 1300), is on the back. Questions about where or how to vote? Contact the Farmington Town Clerk.',
  endISO: '2026-11-04', // the day after (all-day events end on the next day)
};
