// The page's sections in order, with the labels used by the "Sections" menu in
// the top bar (src/components/SectionMenu.astro). Ids must match the <section id>s
// in src/pages/index.astro; the assistant's link labels live in chat/lib/pages.ts.
export const navSections: { id: string; label: string }[] = [
  { id: 'quick', label: 'The 1-minute version' },
  { id: 'farmington', label: 'Farmington’s budget' },
  { id: 'outcomes', label: 'Student outcomes' },
  { id: 'community', label: 'Families and taxpayers' },
  { id: 'ballot', label: 'What the ballot says' },
  { id: 'sixty', label: 'The 60% rule' },
  { id: 'other-side', label: 'What supporters say' },
  { id: 'vote', label: 'How to vote' },
  { id: 'nh-context', label: 'New Hampshire in context' },
  { id: 'math', label: 'The math' },
  { id: 'nearby', label: 'Caps in other NH cities' },
  { id: 'unknowns', label: 'What nobody knows yet' },
  { id: 'faq', label: 'Questions people ask' },
  { id: 'sources', label: 'Sources' },
];
