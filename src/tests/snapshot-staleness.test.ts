import { describe, test, expect } from "vitest";

describe("snapshot staleness", () => {
  test("bilello snapshot has asof date", () => {
    const snap = require("../data/market/bilello.json");
    expect(snap.asof).toBeTruthy();
    expect(typeof snap.asof).toBe("string");
    expect(snap.asof).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  test("bilello snapshot has asset_class_returns_by_year", () => {
    const snap = require("../data/market/bilello.json");
    expect(Array.isArray(snap.asset_class_returns_by_year)).toBe(true);
    expect(snap.asset_class_returns_by_year.length).toBeGreaterThan(100);
  });

  test("bilello snapshot has asset_daily_prices", () => {
    const snap = require("../data/market/bilello.json");
    expect(Array.isArray(snap.asset_daily_prices)).toBe(true);
    expect(snap.asset_daily_prices.length).toBeGreaterThan(1000);
  });

  test("market snapshot cards have asof", () => {
    const snap = require("../data/market/market_snapshot.json");
    expect(snap.cards).toBeDefined();
    expect(Array.isArray(snap.cards)).toBe(true);
    const withAsof = snap.cards.filter((c: any) => c.asof);
    expect(withAsof.length).toBeGreaterThan(0);
  });

  test("econ snapshot has generatedAt", () => {
    const snap = require("../data/econSnapshot.json");
    expect(snap.generatedAt).toBeTruthy();
  });

  test("econ snapshot series have asOf dates", () => {
    const snap = require("../data/econSnapshot.json");
    const series = Object.values(snap.series || {}) as any[];
    expect(series.length).toBeGreaterThan(0);
    for (const s of series.slice(0, 5)) {
      expect(s.asOf).toBeTruthy();
    }
  });
});
