/**
 * Unit specs for prioritizePendingByQuality (LOC-0100).
 *
 * The queue ordering is a pure, in-memory total order over already-mapped
 * response items: quality score ascending (via the LOC-0098 adapter), ties
 * oldest-first, then id ascending so consecutive reads never churn. The
 * helper must not mutate its input — persisting "priorities" is out of scope
 * and mutating shared state is how in-memory ordering becomes a side effect.
 */

import {
  PrioritizablePendingItem,
  prioritizePendingByQuality,
} from "./pending-import-priority";

function item(
  id: string,
  createdAtISO: string,
  sourceData?: Record<string, unknown>
): PrioritizablePendingItem {
  return {
    id,
    name: `Business ${id}`,
    createdAt: createdAtISO,
    sourceData: sourceData ?? { source: "google-maps", originalId: id },
  };
}

describe("prioritizePendingByQuality", () => {
  it("orders items quality-score ascending, weakest first", () => {
    // Scores via the LOC-0098 adapter: phone 15, website 20, both 35.
    const inputs = [
      item("full", "2026-09-01T00:00:00.000Z", {
        phone: "+1-555-0001",
        website: "https://full.example.com",
      }),
      item("bare", "2026-09-02T00:00:00.000Z"),
      item("phone-only", "2026-09-03T00:00:00.000Z", {
        phone: "+1-555-0002",
      }),
    ];

    const ordered = prioritizePendingByQuality(inputs);

    expect(ordered.map((i) => i.id)).toEqual([
      "bare", // score 0
      "phone-only", // score 15
      "full", // score 35
    ]);
  });

  it("breaks score ties oldest-first", () => {
    const inputs = [
      item("mid", "2026-05-02T00:00:00.000Z", { phone: "+1-555-0002" }),
      item("newest", "2026-05-03T00:00:00.000Z", { phone: "+1-555-0003" }),
      item("oldest", "2026-05-01T00:00:00.000Z", { phone: "+1-555-0001" }),
    ];

    const ordered = prioritizePendingByQuality(inputs);

    expect(ordered.map((i) => i.id)).toEqual(["oldest", "mid", "newest"]);
  });

  it("falls back to id ascending when score and createdAt are both equal (total order)", () => {
    const same = "2026-04-01T00:00:00.000Z";
    const inputs = [
      item("zulu", same),
      item("alpha", same),
      item("mike", same),
    ];

    const ordered = prioritizePendingByQuality(inputs);

    expect(ordered.map((i) => i.id)).toEqual(["alpha", "mike", "zulu"]);
  });

  it("is deterministic: repeated runs over equal data agree", () => {
    const inputs = [
      item("r1", "2026-03-05T00:00:00.000Z", { phone: "+1-555-0001" }),
      item("r2", "2026-03-01T00:00:00.000Z"),
      item("r3", "2026-03-03T00:00:00.000Z", {
        phone: "+1-555-0003",
        website: "https://r3.example.com",
      }),
      item("r4", "2026-03-02T00:00:00.000Z", { phone: "+1-555-0004" }),
    ];

    const first = prioritizePendingByQuality(inputs);
    const second = prioritizePendingByQuality(inputs);

    expect(second.map((i) => i.id)).toEqual(first.map((i) => i.id));
  });

  it("does not mutate the input array", () => {
    const inputs = [
      item("keep-1", "2026-02-02T00:00:00.000Z", { phone: "+1-555-0001" }),
      item("keep-2", "2026-02-01T00:00:00.000Z"),
    ];
    const originalOrder = inputs.map((i) => i.id);

    prioritizePendingByQuality(inputs);

    expect(inputs.map((i) => i.id)).toEqual(originalOrder);
  });

  it("handles the empty queue", () => {
    expect(prioritizePendingByQuality([])).toEqual([]);
  });

  it("orders 1,000 varied rows correctly and completes within 100 ms", () => {
    // Deterministic spread across the four pending-row completeness shapes
    // the adapter can score: none (0), phone (15), website (20), both (35).
    const expectedScoreByShape = [0, 15, 20, 35];
    const baseTime = Date.UTC(2026, 0, 1);
    const inputs: PrioritizablePendingItem[] = [];
    for (let i = 0; i < 1000; i++) {
      const sourceData =
        i % 4 === 0
          ? {}
          : i % 4 === 1
            ? { phone: `+1-555-${i}` }
            : i % 4 === 2
              ? { website: `https://b${i}.example.com` }
              : { phone: `+1-555-${i}`, website: `https://bw${i}.example.com` };
      inputs.push(
        item(`p-${String(i).padStart(4, "0")}`, new Date(baseTime + i * 1000).toISOString(), sourceData)
      );
    }

    const startedAt = Date.now();
    const ordered = prioritizePendingByQuality(inputs);
    const elapsedMs = Date.now() - startedAt;

    // Every row present, exactly once.
    expect(ordered.length).toBe(1000);
    expect(new Set(ordered.map((i) => i.id)).size).toBe(1000);

    // Total order holds pairwise: score ascending, then createdAt ascending.
    const scoreOf = (i: PrioritizablePendingItem): number =>
      expectedScoreByShape[Number(i.id.slice(2)) % 4];
    for (let i = 1; i < ordered.length; i++) {
      const prevScore = scoreOf(ordered[i - 1]);
      const score = scoreOf(ordered[i]);
      expect(score).toBeGreaterThanOrEqual(prevScore);
      if (score === prevScore) {
        expect(ordered[i - 1].createdAt <= ordered[i].createdAt).toBe(true);
      }
    }

    // The whole point of in-memory sorting: it must stay trivially cheap.
    expect(elapsedMs).toBeLessThan(100);
  });
});
