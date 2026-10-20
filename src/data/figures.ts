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

// Farmington School District local education property tax levy by tax year
// ("Net Required Local Education Tax Effort" on the state-approved tax rate
// sheet in each Town Report). Tax year Y pays for the school year starting
// July of year Y (e.g. the 2022 levy appears as the "school district
// assessment" in the FY2023 audit). The 2016 figure is approximate: the 2016
// local school rate ($13.31, 2017 Town Report) times 2016 total assessed value
// ($444,256,146); Census reports $5,915K in FY2017 property tax revenue.
export const levy: { year: number; amount: number; source: string }[] = [
  { year: 2016, amount: 5_913_049, source: 'town-report-2017' },
  { year: 2017, amount: 7_074_095, source: 'town-report-2017' },
  { year: 2018, amount: 6_146_065, source: 'town-report-2018' },
  { year: 2019, amount: 6_615_489, source: 'town-report-2019' },
  { year: 2020, amount: 6_776_740, source: 'town-report-2020' },
  { year: 2021, amount: 7_084_557, source: 'town-report-2021' },
  { year: 2022, amount: 7_513_173, source: 'town-report-2022' },
  { year: 2023, amount: 7_295_085, source: 'town-report-2023' },
  { year: 2024, amount: 7_924_730, source: 'town-report-2024' },
  { year: 2025, amount: 7_873_518, source: 'town-report-2025' },
];

// Northeast CPI-U (CUUR0100SA0, not seasonally adjusted), March index values.
export const marchCpiNortheast: Record<number, number> = {
  2016: 252.854,
  2017: 258.51,
  2018: 263.556,
  2019: 268.025,
  2020: 272.531,
  2021: 278.197,
  2022: 298.403,
  2023: 311.243,
  2024: 321.741,
  2025: 332.049,
  2026: 344.142,
};

// HB 1300's inflation figure: the 12-month change in that index "for the month
// of March in the prior fiscal year." For a levy that pays for the school year
// starting July of year Y, that is the 12 months ending March of year Y.
export const capInflation = (year: number) => (marchCpiNortheast[year] / marchCpiNortheast[year - 1] - 1) * 100;

// Estimate of what "new construction" could have added each year: the growth in
// Farmington's total assessed value on the same tax rate sheets in years without
// a town-wide revaluation. (Net value change isn't a hard ceiling: in 2020,
// non-utility value fell slightly after the 2019 revaluation.) In the
// revaluation years (2019, 2024) the true figure is unknown, so we assume a
// generous 3%.
export const constructionAllowance: Record<number, { pct: number; estimated: boolean }> = {
  2017: { pct: 0.93, estimated: false }, // $444,256,146 -> $448,412,073
  2018: { pct: 0.03, estimated: false }, // $448,412,073 -> $448,546,993
  2019: { pct: 3, estimated: true }, // revaluation year
  2020: { pct: 0.05, estimated: false }, // $556,874,665 -> $557,174,859
  2021: { pct: 0.87, estimated: false }, // $557,174,859 -> $562,027,636
  2022: { pct: 0.76, estimated: false }, // $562,027,636 -> $566,292,102
  2023: { pct: 0.97, estimated: false }, // $566,292,102 -> $571,763,40x
  2024: { pct: 3, estimated: true }, // revaluation year
  2025: { pct: 0.93, estimated: false }, // $1,032,071,890 -> $1,041,710,729
};

// "close" = over the estimate by less than 1 point, i.e. within what a larger
// new-construction allowance could plausibly cover.
export const levyYearChanges = levy.slice(1).map((row, i) => {
  const prev = levy[i];
  const change = (row.amount / prev.amount - 1) * 100;
  const cap = capInflation(row.year);
  const allowance = constructionAllowance[row.year];
  const margin = change - (cap + allowance.pct);
  return {
    year: row.year,
    change,
    cap,
    over: margin > 1,
    close: margin > 0 && margin <= 1,
    revaluation: allowance.estimated,
  };
});

// Health insurance increase added to the 2026-27 default budget at the
// Jan. 31, 2026 deliberative session (minutes, March 2026 annual report).
export const healthInsuranceIncrease2026 = 700_000;
export const levy2025 = 7_873_518;
export const netSchoolAppropriations2025 = 15_247_619;
