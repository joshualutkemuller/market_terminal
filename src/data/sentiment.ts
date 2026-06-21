/**
 * SENT — Investor Sentiment & Behavior (deterministic engine).
 *
 * Phase 1: the survey layer (AAII bull/neutral/bear, NAAIM manager exposure),
 * the social layer (reused from the NEWS module's getSocialIntel), and an
 * explainable 0–100 fear/greed Sentiment Index composed from both plus
 * market-based inputs. Everything is seeded so the module renders instantly and
 * SSR-safe with no backend; each component is tagged with the live source it
 * will upgrade to (SURVEY / SOCIAL / FRED / MARKET) so the composite shows what
 * is live vs simulated.
 */
import { Rng } from "@/lib/rng";
import { getSocialIntel } from "./news";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** Weekly Thursdays ending at a fixed recent anchor (AAII/NAAIM publish weekly). */
const ANCHOR_THU = new Date("2026-06-18T00:00:00Z");
function weeklyDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date(ANCHOR_THU);
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 7);
  }
  return out.reverse();
}

// ── AAII Investor Sentiment Survey ───────────────────────────────────────────

export interface AaiiWeek {
  date: string;
  bullish: number; // %
  neutral: number; // %
  bearish: number; // %
  spread: number; // bullish - bearish, pts
}

export function getAaiiHistory(weeks = 104): AaiiWeek[] {
  const dates = weeklyDates(weeks);
  const rng = new Rng("sent-aaii-v1");
  // mean-revert bullish & bearish around historical norms (~37.5 / ~31)
  let bull = 38;
  let bear = 30;
  return dates.map((date) => {
    bull = clamp(bull + (37.5 - bull) * 0.12 + rng.normal(0, 4.5), 15, 62);
    bear = clamp(bear + (31 - bear) * 0.12 + rng.normal(0, 4.5), 12, 58);
    const neutral = clamp(100 - bull - bear, 8, 60);
    const b = Number(bull.toFixed(1));
    const be = Number(bear.toFixed(1));
    const ne = Number((100 - b - be).toFixed(1));
    return { date, bullish: b, neutral: ne, bearish: be, spread: Number((b - be).toFixed(1)) };
  });
}

export type AaiiZone = "Euphoria" | "Optimism" | "Neutral" | "Pessimism" | "Capitulation";

export interface AaiiSnapshot {
  latest: AaiiWeek;
  prior: AaiiWeek;
  spreadPctile: number; // 0-100 in own history
  bullPctile: number;
  zone: AaiiZone;
  note: string;
}

function pctile(arr: number[], v: number): number {
  return Math.round((arr.filter((x) => x <= v).length / arr.length) * 100);
}

export function getAaiiSnapshot(): AaiiSnapshot {
  const h = getAaiiHistory();
  const latest = h[h.length - 1];
  const prior = h[h.length - 2];
  const spreads = h.map((w) => w.spread);
  const bulls = h.map((w) => w.bullish);
  const sp = pctile(spreads, latest.spread);
  const zone: AaiiZone = sp >= 85 ? "Euphoria" : sp >= 60 ? "Optimism" : sp >= 40 ? "Neutral" : sp >= 15 ? "Pessimism" : "Capitulation";
  const note =
    zone === "Euphoria"
      ? "Retail bullishness in the top decile — historically a contrarian caution flag."
      : zone === "Capitulation"
      ? "Retail capitulation — historically a contrarian support level."
      : zone === "Optimism"
      ? "Retail leaning bullish but not extreme."
      : zone === "Pessimism"
      ? "Retail cautious; watch for washout or recovery."
      : "Retail sentiment balanced near historical norms.";
  return { latest, prior, spreadPctile: sp, bullPctile: pctile(bulls, latest.bullish), zone, note };
}

// ── NAAIM Exposure Index (active manager equity exposure) ─────────────────────

export interface NaaimWeek {
  date: string;
  exposure: number; // typically 0-100 (can be -200..200)
}
export function getNaaimHistory(weeks = 104): NaaimWeek[] {
  const dates = weeklyDates(weeks);
  const rng = new Rng("sent-naaim-v1");
  let e = 75;
  return dates.map((date) => {
    e = clamp(e + (72 - e) * 0.1 + rng.normal(0, 9), 10, 105);
    return { date, exposure: Number(e.toFixed(1)) };
  });
}

// ── Composite Sentiment Index (0-100 fear↔greed) ─────────────────────────────

export type SentSource = "SURVEY" | "SOCIAL" | "FRED" | "MARKET";
export interface SentComponent {
  label: string;
  score: number; // 0-100 (100 = greed)
  weight: number;
  detail: string;
  source: SentSource;
  live: boolean; // would this be live once feeds are wired
}

export type SentRegime = "Extreme Fear" | "Fear" | "Neutral" | "Greed" | "Extreme Greed";

export interface SentimentIndex {
  score: number;
  regime: SentRegime;
  components: SentComponent[];
  delta1w: number;
  readThrough: string;
}

function regimeOf(score: number): SentRegime {
  return score < 20 ? "Extreme Fear" : score < 40 ? "Fear" : score < 60 ? "Neutral" : score < 80 ? "Greed" : "Extreme Greed";
}

/** Map AAII bull-bear spread (≈ -40..+40) to a 0-100 greed score. */
const spreadToScore = (s: number) => clamp(((s + 25) / 50) * 100);
/** Net social sentiment (-1..1) to 0-100. */
const netToScore = (s: number) => clamp(((s + 0.6) / 1.2) * 100);

function buildIndex(forWeeksAgo = 0): { score: number; components: SentComponent[] } {
  const aaii = getAaiiHistory();
  const naaim = getNaaimHistory();
  const a = aaii[aaii.length - 1 - forWeeksAgo];
  const nm = naaim[naaim.length - 1 - forWeeksAgo];
  const social = getSocialIntel();
  const netSocial = social.platforms.reduce((s, p) => s + p.sentiment, 0) / social.platforms.length;
  const avgVel = social.tickers.reduce((s, t) => s + t.velocity, 0) / Math.max(1, social.tickers.length);

  // market-based inputs (seeded; upgrade to live market/FRED layer later)
  const rng = new Rng(`sent-mkt-${forWeeksAgo}`);
  const putCallScore = clamp(rng.normal(58, 12)); // inverted p/c → greed
  const vixScore = clamp(rng.normal(62, 12)); // low vol percentile → greed
  const breadthScore = clamp(rng.normal(60, 14));
  const havenScore = clamp(rng.normal(55, 12));

  const components: SentComponent[] = [
    { label: "AAII bull–bear", score: Math.round(spreadToScore(a.spread)), weight: 0.2, detail: `spread ${a.spread >= 0 ? "+" : ""}${a.spread}`, source: "SURVEY", live: true },
    { label: "NAAIM exposure", score: Math.round(clamp(nm.exposure)), weight: 0.15, detail: `${nm.exposure}% invested`, source: "SURVEY", live: true },
    { label: "Social net sentiment", score: Math.round(netToScore(netSocial)), weight: 0.2, detail: `${netSocial >= 0 ? "+" : ""}${netSocial.toFixed(2)}`, source: "SOCIAL", live: true },
    { label: "Social velocity", score: Math.round(clamp(50 + avgVel * 0.4)), weight: 0.1, detail: `${avgVel >= 0 ? "+" : ""}${avgVel.toFixed(0)}% mentions`, source: "SOCIAL", live: true },
    { label: "Put/Call (inv)", score: Math.round(putCallScore), weight: 0.1, detail: "options demand", source: "MARKET", live: false },
    { label: "Volatility (inv)", score: Math.round(vixScore), weight: 0.1, detail: "VIX percentile", source: "FRED", live: true },
    { label: "Breadth / momentum", score: Math.round(breadthScore), weight: 0.1, detail: "advancers", source: "MARKET", live: false },
    { label: "Safe-haven demand", score: Math.round(havenScore), weight: 0.05, detail: "risk appetite", source: "MARKET", live: false },
  ];
  const score = Math.round(clamp(components.reduce((s, c) => s + c.score * c.weight, 0)));
  return { score, components };
}

export function getSentimentIndex(): SentimentIndex {
  const now = buildIndex(0);
  const wk = buildIndex(1);
  const regime = regimeOf(now.score);
  const readThrough =
    regime === "Extreme Greed"
      ? "Crowd is euphoric — historically a contrarian caution flag; tighten risk, fade chasing."
      : regime === "Greed"
      ? "Risk appetite elevated — trend intact but crowding building; mind stops."
      : regime === "Neutral"
      ? "Sentiment balanced — no strong behavioral edge either way."
      : regime === "Fear"
      ? "Caution dominant — selective dip-buying historically rewarded from here."
      : "Capitulation — extreme fear has historically marked contrarian support.";
  return { score: now.score, regime, components: now.components, delta1w: now.score - wk.score, readThrough };
}

// ── Headline summary ─────────────────────────────────────────────────────────

export interface SentimentSummary {
  index: number;
  regime: SentRegime;
  delta1w: number;
  aaiiSpread: number;
  aaiiZone: AaiiZone;
  naaim: number;
  socialNet: number;
  topTicker: string;
}
export function getSentimentSummary(): SentimentSummary {
  const idx = getSentimentIndex();
  const aaii = getAaiiSnapshot();
  const naaim = getNaaimHistory();
  const social = getSocialIntel();
  const netSocial = social.platforms.reduce((s, p) => s + p.sentiment, 0) / social.platforms.length;
  return {
    index: idx.score,
    regime: idx.regime,
    delta1w: idx.delta1w,
    aaiiSpread: aaii.latest.spread,
    aaiiZone: aaii.zone,
    naaim: naaim[naaim.length - 1].exposure,
    socialNet: Number(netSocial.toFixed(2)),
    topTicker: social.tickers[0]?.label ?? "—",
  };
}

export { getSocialIntel };
