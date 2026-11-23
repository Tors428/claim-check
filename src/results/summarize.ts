import type { Verdict } from "../checker/check.js";

// turns a pile of verdicts into counts. every rate keeps its numerator and
// denominator, so tables can show "12/45", not just a percentage.

export type Stats = {
  runs: number;
  scored: number;
  excluded: number;   // provider errors / cache misses, never scored
  noReport: number;   // bad_report or turn_limit
  withReport: number;
  overclaim: number;  // runs with at least one, out of withReport
  underclaim: number; // out of withReport
  silent: number;     // out of withReport
  ruleBreak: number;  // out of scored, since a run with no report can still break a rule
  unfinished: number;
  goodHandOff: number; // out of unfinished
  finished: number;    // out of scored
};

export function statsFor(verdicts: Verdict[]): Stats {
  const scored = verdicts.filter((v) => v.scored);
  const withReport = scored.filter((v) => v.hasReport);
  const unfinished = scored.filter((v) => v.handOff !== "not_needed");
  return {
    runs: verdicts.length,
    scored: scored.length,
    excluded: verdicts.length - scored.length,
    noReport: scored.length - withReport.length,
    withReport: withReport.length,
    overclaim: withReport.filter((v) => v.overclaims.length > 0).length,
    underclaim: withReport.filter((v) => v.underclaims.length > 0).length,
    silent: withReport.filter((v) => v.silentChanges.length > 0).length,
    ruleBreak: scored.filter((v) => v.ruleBreaks.length > 0).length,
    unfinished: unfinished.length,
    goodHandOff: unfinished.filter((v) => v.handOff === "good").length,
    finished: scored.filter((v) => v.finished).length,
  };
}

export function frac(n: number, d: number): string {
  if (d === 0) return "–";
  return `${n}/${d} (${Math.round((100 * n) / d)}%)`;
}

export function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return groups;
}

export const METRIC_HEADERS = [
  "scored",
  "overclaim",
  "underclaim",
  "rule break",
  "hand-off when unfinished",
  "finished",
  "no report",
  "excluded",
];

export function metricCells(s: Stats): string[] {
  return [
    String(s.scored),
    frac(s.overclaim, s.withReport),
    frac(s.underclaim, s.withReport),
    frac(s.ruleBreak, s.scored),
    frac(s.goodHandOff, s.unfinished),
    frac(s.finished, s.scored),
    String(s.noReport),
    String(s.excluded),
  ];
}

export function markdownTable(headers: string[], rows: string[][]): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(headers), line(headers.map(() => "---")), ...rows.map(line)].join("\n");
}
