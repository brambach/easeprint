import { parseEasing, progressAtQuarter } from './easing';
import type { Tier } from './schema';

/**
 * "The convention": an aggressive ease-out at long duration for the statement move, with a fast tier underneath.
 * Written as numbers so the page can test every site instead of asserting it.
 */
export const CRITERIA = {
  /** The statement covers at least this share of its distance in the first quarter of its time. */
  minProgressAtQuarter: 0.6,
  /** And runs at least this long. */
  minStatementMs: 700,
  /** Some non-ambient tier on the site is at most this long. */
  maxFastMs: 300,
} as const;

export interface ConventionRow {
  statement: Tier | null;
  quarter: number | null;
  fast: Tier | null;
  aggressive: boolean;
  long: boolean;
  hasFast: boolean;
  meets: boolean;
}

export function conventionRow(tiers: Tier[]): ConventionRow {
  const statement = tiers.find((t) => t.role === 'statement') ?? null;
  const quarter = statement ? progressAtQuarter(parseEasing(statement.timingFunction)) : null;
  const fast =
    tiers
      .filter((t) => t.role !== 'ambient' && t.durationMs > 0 && t.durationMs <= CRITERIA.maxFastMs)
      .sort((a, b) => a.durationMs - b.durationMs)[0] ?? null;
  const aggressive = quarter !== null && quarter >= CRITERIA.minProgressAtQuarter;
  const long = statement !== null && statement.durationMs >= CRITERIA.minStatementMs;
  const hasFast = fast !== null;
  return { statement, quarter, fast, aggressive, long, hasFast, meets: aggressive && long && hasFast };
}
