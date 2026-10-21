// Numbers used in tables and charts. Each block notes where it came from.

// State test results: percent proficient or better, all tested grades.
// [Farmington, New Hampshire]. Sources: Farmington School District annual
// reports (2025, 2026), the SDGA-NH compilation of NH Department of Education
// results, NHPR (2018 state averages) and the Keene Sentinel (2026 state
// averages from the NH DOE's Sept. 2, 2026 release).
export const scores: { year: number; math: [number, number]; ela: [number, number]; sci: [number, number] }[] = [
  { year: 2018, math: [32, 48], ela: [46, 58], sci: [25, 42] },
  { year: 2019, math: [28, 48], ela: [41, 56], sci: [19, 40] },
  { year: 2020, math: [0, 0], ela: [0, 0], sci: [0, 0] },
  { year: 2021, math: [21, 38], ela: [36, 52], sci: [22, 37] },
  { year: 2022, math: [23, 40], ela: [44, 51], sci: [38, 37] },
  { year: 2023, math: [38, 42], ela: [49, 52], sci: [41, 37] },
  { year: 2024, math: [39, 41], ela: [48, 53], sci: [34, 36] },
  { year: 2025, math: [33, 42], ela: [49, 55], sci: [45, 38] },
  { year: 2026, math: [31, 44], ela: [41, 55], sci: [26, 38] },
];

// The district's preliminary estimate for 2027-28 (Oct. 19, 2026 School Board
// presentation): at an assumed 3% inflation and no new-construction growth the
// cap allows $377,523, against $738,287 in expected increases for staff
// contracts, health insurance (+19% projected) and dental only. The starting
// levy is implied by those figures: $377,523 / 3% = $12,584,100 ("about $12.6
// million" on the page). Used by the "what would the cap allow?" calculator.
export const districtEstimate = {
  assumedInflation: 3,
  allowed: 377_523,
  expected: 738_287,
  baseLevy: 12_584_100,
};

// Northeast CPI readings quoted on the page (12-month change), for calculator presets.
export const cpiReadings = [
  { label: 'District’s assumption', value: 3 },
  { label: 'March 2026', value: 3.6 },
  { label: 'Sept. 2026', value: 4.2 },
];

// Total school spending vs. inflation, fiscal 2016 to fiscal 2025 (years end
// June 30). Spending: "Total Expenditures for All Purposes" in the district's
// DOE-25 financial reports to the NH Department of Education (FY2025 not yet
// audited). Prices: U.S. CPI-U annual averages, 2016 and 2025 (BLS).
export const spendingVsInflation = {
  fy2016: 16_528_690.75,
  fy2025: 19_955_850.64,
  cpi2016: 240.007,
  cpi2025: 321.943,
};

// Spending by category, fiscal 2016 and 2024, in $ thousands, from the Census
// Bureau's Annual Survey of School System Finances (FY2025 not yet published).
// Real change uses U.S. CPI-U annual averages for 2016 (240.007) and 2024
// (313.689), +30.7%.
export const spendingCategories = {
  cpi2016: 240.007,
  cpi2024: 313.689,
  rows: [
    { label: 'Instruction', note: 'teachers, aides, classroom costs', fy2016: 8_875, fy2024: 10_115 },
    { label: 'Student support', note: 'counselors, nurses, therapists', fy2016: 1_382, fy2024: 1_369 },
    { label: 'Instructional staff support', note: 'curriculum, training, library', fy2016: 748, fy2024: 364 },
    { label: 'General administration', note: 'school board, superintendent’s office', fy2016: 1_153, fy2024: 855 },
    { label: 'School administration', note: 'principals’ offices', fy2016: 1_005, fy2024: 1_110 },
    { label: 'Business and central services', note: 'finance, technology, other support', fy2016: 293, fy2024: 967 },
    { label: 'Building operations and maintenance', note: '', fy2016: 1_438, fy2024: 1_755 },
    { label: 'Student transportation', note: '', fy2016: 529, fy2024: 550 },
    { label: 'Food service', note: '', fy2016: 470, fy2024: 371 },
  ],
  total: { label: 'All day-to-day spending', fy2016: 15_893, fy2024: 17_456 },
};

// State test results by grade, spring 2024-2026: percent proficient or better,
// [Farmington, New Hampshire]; null where the state reports only "<10%". Grades
// 3-8 take the NH SAS; grade 11 takes the SAT in math and reading and the NH SAS
// in science. Source: SDGA-NH compilation of NH Department of Education results
// ("Base Data" tab, District Data and State Data rows). About 40-65 Farmington
// students were tested in each grade.
type GradeRow = { grade: number; test: string; years: [number | null, number][] };
export const scoreYearsByGrade = [2024, 2025, 2026];
export const scoresByGrade: { subject: string; rows: GradeRow[] }[] = [
  {
    subject: 'Math',
    rows: [
      { grade: 3, test: 'NH SAS', years: [[27, 53], [47, 53], [42, 54]] },
      { grade: 4, test: 'NH SAS', years: [[55, 49], [45, 52], [33, 52]] },
      { grade: 5, test: 'NH SAS', years: [[48, 40], [31, 40], [32, 43]] },
      { grade: 6, test: 'NH SAS', years: [[45, 41], [43, 41], [31, 43]] },
      { grade: 7, test: 'NH SAS', years: [[40, 40], [20, 41], [40, 44]] },
      { grade: 8, test: 'NH SAS', years: [[49, 37], [40, 38], [25, 40]] },
      { grade: 11, test: 'SAT', years: [[10, 30], [null, 31], [13, 30]] },
    ],
  },
  {
    subject: 'Reading',
    rows: [
      { grade: 3, test: 'NH SAS', years: [[41, 50], [39, 49], [42, 51]] },
      { grade: 4, test: 'NH SAS', years: [[51, 50], [47, 53], [40, 52]] },
      { grade: 5, test: 'NH SAS', years: [[60, 56], [55, 57], [38, 58]] },
      { grade: 6, test: 'NH SAS', years: [[33, 52], [52, 53], [50, 52]] },
      { grade: 7, test: 'NH SAS', years: [[56, 54], [44, 55], [47, 57]] },
      { grade: 8, test: 'NH SAS', years: [[53, 49], [51, 52], [27, 51]] },
      { grade: 11, test: 'SAT', years: [[43, 63], [57, 66], [48, 62]] },
    ],
  },
  {
    subject: 'Science',
    rows: [
      { grade: 5, test: 'NH SAS', years: [[41, 36], [29, 38], [16, 38]] },
      { grade: 8, test: 'NH SAS', years: [[45, 34], [64, 37], [29, 37]] },
      { grade: 11, test: 'NH SAS', years: [[17, 39], [38, 39], [35, 40]] },
    ],
  },
];
