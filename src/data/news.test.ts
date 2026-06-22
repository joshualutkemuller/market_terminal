import { describe, expect, it } from "vitest";
import { getMarketImpact } from "./news";

describe("NEWS-4 market impact event study", () => {
  it("serves every event as a labelled historical event-study table", () => {
    const impact = getMarketImpact();

    expect(impact).toHaveLength(8);
    for (const event of impact) {
      expect(event.model).toBe("HISTORICAL_EVENT_STUDY");
      expect(event.datasets.length).toBeGreaterThan(0);
      expect(event.magnitude.length).toBeGreaterThan(0);
      expect(event.access.length).toBeGreaterThan(0);
      expect(event.rows).toHaveLength(8);
    }
  });

  it("includes mean forward returns, hit-rate, and sample size for each asset", () => {
    const auctionTail = getMarketImpact().find((event) => event.event === "Treasury Auction Tail");

    expect(auctionTail).toBeDefined();
    if (!auctionTail) return;
    expect(auctionTail.rows[0]).toMatchObject({ asset: "SPY", n: auctionTail.occurrences });

    for (const row of auctionTail.rows) {
      expect(Number.isFinite(row.d1)).toBe(true);
      expect(Number.isFinite(row.w1)).toBe(true);
      expect(Number.isFinite(row.m1)).toBe(true);
      expect(row.hitRate).toBeGreaterThanOrEqual(0);
      expect(row.hitRate).toBeLessThanOrEqual(100);
      expect(row.n).toBe(auctionTail.occurrences);
    }
  });
});
