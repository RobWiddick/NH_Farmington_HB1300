// Site-wide settings. Edit these before launch.
export const site = {
  // Search-result title (aim for 60 characters or fewer) and description (about 155).
  title: 'NH Question 2: The HB 1300 Tax Cap & Farmington Schools',
  // The site's author. Shown in the hero ("I'm …") and footer ("Written by …").
  publisher: 'Brittni Widdick',
  shortTitle: 'Farmington: Question 2',
  description:
    'What NH Question 2, the HB 1300 school tax cap, would do in Farmington: the 60% rule, an estimated $360K gap, both sides. By Brittni Widdick, who urges No.',
  electionDate: 'Tuesday, November 3, 2026',
  electionDateShort: 'Vote Tuesday, Nov. 3',
  // Used for the countdown and the "Add to my calendar" links.
  electionDateISO: '2026-11-03',
  // First published, and the last time the page's content changed (shown in the footer and in search
  // engines' structured data). Update both last-updated fields together.
  publishedISO: '2026-10-20',
  lastUpdated: 'October 21, 2026',
  lastUpdatedISO: '2026-10-21',
  // "Paid for by" line shown in the footer (political advertising disclosure, RSA 664:14).
  disclosure: 'Paid for by Brittni Widdick, 35 Governors Rd, Farmington, NH',
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
