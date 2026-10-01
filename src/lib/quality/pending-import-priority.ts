/**
 * Pending-import queue prioritization (LOC-0100).
 *
 * Turns the admin review queue into a weakest-first work list: quality score
 * ascending so review effort lands where data quality is worst. Pure and
 * in-memory (blueprint DR-3/DR-4): scoring is delegated to the LOC-0098
 * adapter (`scorePendingImport`) — this module adds ordering, never scoring,
 * persistence, clocks, or caching.
 *
 * The comparator is a total order — score ascending, then oldest-first, then
 * id ascending — so consecutive reads of identical data always agree and
 * page loads never churn. Returns a NEW array; the input stays untouched.
 */

import { scorePendingImport } from "./listing-quality-score";

/**
 * Minimal structural view of a mapped pending-queue item. Deliberately not
 * `PendingBusinessResponse`: the route's response items satisfy this shape and
 * the module stays free of route/DB imports, mirroring how
 * `PendingImportRecordFields` keeps the scorer storage-blind.
 */
export interface PrioritizablePendingItem {
  id: string;
  name: string;
  /** ISO timestamp; lexicographic comparison matches chronological for same-format ISO strings. */
  createdAt: string;
  /** Decoded `source_data` JSONB (camelCase), as the queue route maps it out. */
  sourceData?: Record<string, unknown> | null;
}

/** Ascending three-way comparison with a stable fallback for equal values. */
function compareAscending(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/**
 * Orders pending-queue items weakest-first by listing-quality score. Each
 * item is scored exactly once (up front, not per comparison), so a 1,000-row
 * queue costs O(n log n) comparisons over precomputed keys, well inside the
 * AC's 100 ms budget.
 */
export function prioritizePendingByQuality<
  T extends PrioritizablePendingItem
>(items: readonly T[]): T[] {
  const scored = items.map((item) => ({
    item,
    score: scorePendingImport({
      name: item.name,
      sourceData: item.sourceData ?? undefined,
    }).score,
  }));

  scored.sort((a, b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    const byAge = compareAscending(a.item.createdAt, b.item.createdAt);
    return byAge !== 0 ? byAge : compareAscending(a.item.id, b.item.id);
  });

  return scored.map(({ item }) => item);
}
