import { describe, it, expect } from "vitest";
import { classifyFreshness } from "./provenance";

const NOW = new Date("2026-06-23T12:00:00Z");

describe("classifyFreshness", () => {
  it("treats recent data (within a few days) as fresh, with no marker", () => {
    const info = classifyFreshness("2026-06-22", { now: NOW });
    expect(info.status).toBe("FRESH");
    expect(info.ageDays).toBe(1);
    expect(info.label).toBe("");
  });

  it("flags data past the fresh window as aging", () => {
    const info = classifyFreshness("2026-06-16", { now: NOW });
    expect(info.status).toBe("AGING");
    expect(info.ageDays).toBe(7);
    expect(info.label).toBe("7d");
  });

  it("flags data past the aging window as stale", () => {
    const info = classifyFreshness("2026-05-20", { now: NOW });
    expect(info.status).toBe("STALE");
    expect(info.label).toMatch(/^STALE · \d+d$/);
  });

  it("respects custom thresholds", () => {
    expect(classifyFreshness("2026-06-21", { now: NOW, freshDays: 1 }).status).toBe("AGING");
  });

  it("returns UNKNOWN with no marker for missing or unparseable dates", () => {
    expect(classifyFreshness(null, { now: NOW }).status).toBe("UNKNOWN");
    expect(classifyFreshness(null, { now: NOW }).label).toBe("");
    expect(classifyFreshness("not-a-date", { now: NOW }).status).toBe("UNKNOWN");
  });

  it("accepts ISO timestamps as well as plain dates", () => {
    expect(classifyFreshness("2026-06-23T09:00:00Z", { now: NOW }).status).toBe("FRESH");
  });
});
