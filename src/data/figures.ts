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
