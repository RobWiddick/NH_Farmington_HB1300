// Sections of the page the assistant can link to with [page:id]. The labels are
// what the chat shows on the link. scripts/build-corpus.mjs fails the build if
// these ids stop matching the page's <section id>s.
export const pages: Record<string, string> = {
  top: 'Overview',
  quick: 'The 1-minute version',
  farmington: 'What it means for Farmington',
  outcomes: 'Student outcomes',
  community: 'Farmington’s families and tax base',
  ballot: 'What the ballot says',
  sixty: 'The 60% rule',
  'other-side': 'What supporters say',
  alternatives: 'What about alternatives?',
  vote: 'How to vote',
  'nh-context': 'New Hampshire in context',
  math: 'The math',
  nearby: 'Caps in other NH cities',
  unknowns: 'What nobody knows yet',
  faq: 'Common questions',
  sources: 'Sources',
};
