import { Rng } from "@/lib/rng";
import { UNIVERSE, EQUITIES, type Security, type AssetClass } from "./universe";

export interface Quote {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  sector: string;
  last: number;
  chg: number;
  chgPct: number;
  bid: number;
  ask: number;
  vol: number; // shares/contracts
  notional: number;
  vwap: number;
  high: number;
  low: number;
  open: number;
  spark: number[];
}

function quoteFor(s: Security, rng: Rng): Quote {
  const chgPct = rng.normal(0, 1) * s.vol * 100;
  const last = s.px * (1 + chgPct / 100);
  const chg = last - s.px;
  const spread = Math.max(0.01, s.px * rng.float(0.0001, 0.0008));
  const vol = Math.round(rng.float(0.4, 4) * (s.marketCap > 1e9 ? 8e6 : 1.2e6));
  const intr = rng.walk(40, s.px * (1 - Math.abs(chgPct) / 200), s.vol / 3, chgPct / 4000);
  intr.push(last);
  return {
    ticker: s.ticker, name: s.name, assetClass: s.assetClass, sector: s.sector,
    last, chg, chgPct,
    bid: last - spread / 2, ask: last + spread / 2,
    vol, notional: vol * last,
    vwap: last * (1 + rng.normal(0, 0.001)),
    high: Math.max(last, s.px) * (1 + rng.float(0.001, 0.02)),
    low: Math.min(last, s.px) * (1 - rng.float(0.001, 0.02)),
    open: s.px * (1 + rng.normal(0, s.vol)),
    spark: intr,
  };
}

export function getQuotes(seedOffset = 0): Quote[] {
  const rng = new Rng(7001 + seedOffset);
  return UNIVERSE.map((s) => quoteFor(s, rng));
}

export const QUOTES = getQuotes();

export function quotesByClass(ac: AssetClass): Quote[] {
  return QUOTES.filter((q) => q.assetClass === ac);
}

export interface IndexQuote {
  symbol: string;
  name: string;
  last: number;
  chg: number;
  chgPct: number;
  spark: number[];
}

export function getIndices(): IndexQuote[] {
  const rng = new Rng(8002);
  const seed: [string, string, number][] = [
    ["SPX", "S&P 500", 5974.5],
    ["NDX", "Nasdaq 100", 21345.8],
    ["INDU", "Dow Jones", 43210.4],
    ["RUT", "Russell 2000", 2412.7],
    ["VIX", "CBOE VIX", 14.2],
    ["MOVE", "MOVE Index", 92.4],
    ["DXY", "Dollar Index", 106.8],
    ["UST10Y", "US 10Y Yield", 4.42],
    ["SOFR", "SOFR", 4.58],
    ["GC", "Gold Spot", 2648.1],
    ["CL", "WTI Crude", 71.4],
    ["BTC", "Bitcoin", 104250],
  ];
  return seed.map(([symbol, name, base]) => {
    const chgPct = rng.normal(0, 1) * (symbol === "VIX" || symbol === "BTC" ? 2.4 : 0.6);
    const last = base * (1 + chgPct / 100);
    return { symbol, name, last, chg: last - base, chgPct, spark: rng.walk(30, base, 0.004, chgPct / 3000).concat(last) };
  });
}

export type LiveFredData = Record<string, { observations: { date: string; value: number }[]; source: string }>;

const INDEX_FRED: Record<string, string> = {
  VIX: "VIXCLS",
  DXY: "DTWEXBGS",
  UST10Y: "DGS10",
  SOFR: "SOFR",
  GC: "GOLDPMGBD228NLBM",
  CL: "DCOILWTICO",
};

export const INDEX_FRED_IDS = Object.values(INDEX_FRED);

export function mergeLiveIndices(sim: IndexQuote[], fred: LiveFredData): IndexQuote[] {
  return sim.map((q) => {
    const fredId = INDEX_FRED[q.symbol];
    if (!fredId) return q;
    const obs = fred[fredId]?.observations;
    if (!obs?.length) return q;
    const latest = obs[obs.length - 1].value;
    const prior = obs.length > 1 ? obs[obs.length - 2].value : latest;
    const chg = latest - prior;
    const chgPct = prior !== 0 ? (chg / prior) * 100 : 0;
    const spark = obs.slice(-30).map((o) => o.value);
    return { ...q, last: latest, chg, chgPct, spark };
  });
}

export interface HeatCell {
  ticker: string;
  sector: string;
  chgPct: number;
  weight: number; // market cap weight for treemap sizing
}

export function getHeatmap(): HeatCell[] {
  const quotes = quotesByClass("EQUITY");
  const total = EQUITIES.reduce((a, s) => a + s.marketCap, 0);
  return quotes.map((q) => {
    const sec = EQUITIES.find((s) => s.ticker === q.ticker)!;
    return { ticker: q.ticker, sector: q.sector, chgPct: q.chgPct, weight: sec.marketCap / total };
  });
}

export interface Mover {
  ticker: string;
  name: string;
  chgPct: number;
  last: number;
  vol: number;
}

export function getMovers(): { gainers: Mover[]; losers: Mover[]; volume: Mover[] } {
  const eq = quotesByClass("EQUITY").map((q) => ({ ticker: q.ticker, name: q.name, chgPct: q.chgPct, last: q.last, vol: q.vol }));
  const gainers = [...eq].sort((a, b) => b.chgPct - a.chgPct).slice(0, 8);
  const losers = [...eq].sort((a, b) => a.chgPct - b.chgPct).slice(0, 8);
  const volume = [...eq].sort((a, b) => b.vol - a.vol).slice(0, 8);
  return { gainers, losers, volume };
}

export interface PipelineCard {
  series_id: string;
  display_name: string;
  asset_class: string;
  price: number | null;
  ret_1d: number | null;
}

export function heatmapFromCards(cards: PipelineCard[]): HeatCell[] {
  const eq = cards.filter((c) => c.asset_class === "equity" && c.ret_1d != null);
  if (!eq.length) return getHeatmap();
  const total = eq.length;
  return eq.map((c) => {
    const sec = EQUITIES.find((s) => s.ticker === c.series_id);
    return {
      ticker: c.series_id,
      sector: sec?.sector ?? "Other",
      chgPct: (c.ret_1d ?? 0) * 100,
      weight: sec ? sec.marketCap / EQUITIES.reduce((a, s) => a + s.marketCap, 0) : 1 / total,
    };
  });
}

export function moversFromCards(cards: PipelineCard[]): { gainers: Mover[]; losers: Mover[] } {
  const eq = cards
    .filter((c) => c.asset_class === "equity" && c.ret_1d != null && c.price != null)
    .map((c) => ({ ticker: c.series_id, name: c.display_name, chgPct: (c.ret_1d ?? 0) * 100, last: c.price ?? 0, vol: 0 }));
  if (!eq.length) { const m = getMovers(); return { gainers: m.gainers, losers: m.losers }; }
  const gainers = [...eq].sort((a, b) => b.chgPct - a.chgPct).slice(0, 8);
  const losers = [...eq].sort((a, b) => a.chgPct - b.chgPct).slice(0, 8);
  return { gainers, losers };
}

export interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export function getCandles(ticker: string, n = 60): Candle[] {
  const s = UNIVERSE.find((u) => u.ticker === ticker) ?? UNIVERSE[0];
  const rng = new Rng(`candle-${ticker}`);
  const out: Candle[] = [];
  let price = s.px * (1 - rng.float(0.02, 0.08));
  for (let i = 0; i < n; i++) {
    const o = price;
    const drift = rng.normal(0.0004, s.vol / 4);
    const c = o * (1 + drift);
    const h = Math.max(o, c) * (1 + rng.float(0, s.vol / 3));
    const l = Math.min(o, c) * (1 - rng.float(0, s.vol / 3));
    const hh = i * 60;
    const t = `${String(9 + Math.floor(hh / 60 / 60)).padStart(2, "0")}:${String((i * 6) % 60).padStart(2, "0")}`;
    out.push({ t, o, h, l, c, v: Math.round(rng.float(0.3, 2.5) * 5e5) });
    price = c;
  }
  return out;
}

export interface OrderFlowRow {
  px: number;
  bidSize: number;
  askSize: number;
}

export function getOrderBook(ticker: string): { bids: OrderFlowRow[]; asks: OrderFlowRow[]; last: number } {
  const q = QUOTES.find((x) => x.ticker === ticker) ?? QUOTES[0];
  const rng = new Rng(`book-${ticker}`);
  const tick = Math.max(0.01, q.last * 0.0002);
  const bids: OrderFlowRow[] = [];
  const asks: OrderFlowRow[] = [];
  for (let i = 1; i <= 10; i++) {
    bids.push({ px: q.last - tick * i, bidSize: Math.round(rng.float(1, 40)) * 100, askSize: 0 });
    asks.push({ px: q.last + tick * i, bidSize: 0, askSize: Math.round(rng.float(1, 40)) * 100 });
  }
  return { bids, asks, last: q.last };
}
