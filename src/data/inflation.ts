import { Rng } from "@/lib/rng";

/**
 * Inflation explorer data — CPI, Core CPI, PCE, Core PCE down to item level.
 *
 * For every series we expose the monthly index reading, the MoM % change, the
 * YoY % change, and how much those % numbers changed vs the prior print
 * (momAccel / yoyAccel — i.e. acceleration / deceleration). Each item carries
 * its FRED id so it is drillable to a rolling-24-month live view.
 */

export type InflationGroup = "CPI" | "CORE_CPI" | "PCE" | "CORE_PCE";

export interface InflationItem {
  id: string; // FRED series id
  label: string;
  group: InflationGroup;
  kind: "HEADLINE" | "COMPONENT";
  weight: number; // % of basket (components)
  index: number; // latest index level
  mom: number; // MoM %
  yoy: number; // YoY %
  priorMom: number;
  priorYoy: number;
  momAccel: number; // mom - priorMom
  yoyAccel: number; // yoy - priorYoy
  contribution: number; // weighted YoY contribution (pp)
}

// [fredId, label, group, weight%, baseYoY, baseIndex]
const HEADLINES: [string, string, InflationGroup, number][] = [
  ["CPIAUCSL", "CPI — All Items", "CPI", 2.6],
  ["CPILFESL", "Core CPI (ex Food & Energy)", "CORE_CPI", 3.0],
  ["PCEPI", "PCE Price Index", "PCE", 2.3],
  ["PCEPILFE", "Core PCE (ex Food & Energy)", "CORE_PCE", 2.6],
];

const CPI_COMPONENTS: [string, string, number, number][] = [
  // id, label, weight%, baseYoY
  ["CUSR0000SAH1", "Shelter", 34.8, 3.9],
  ["CUSR0000SEHC", "Owners' Equiv. Rent", 26.8, 4.1],
  ["CUSR0000SEHA", "Rent of Primary Residence", 7.6, 3.8],
  ["CPIUFDSL", "Food", 13.4, 2.2],
  ["CUSR0000SAF11", "Food at Home", 8.1, 1.6],
  ["CUSR0000SEFV", "Food Away from Home", 5.3, 3.4],
  ["CPIENGSL", "Energy", 6.8, -1.8],
  ["CUSR0000SETB01", "Gasoline", 3.3, -4.2],
  ["CUSR0000SEHF01", "Electricity", 2.5, 3.1],
  ["CPIMEDSL", "Medical Care", 8.1, 3.0],
  ["CUSR0000SETA01", "New Vehicles", 4.1, 0.4],
  ["CUSR0000SETA02", "Used Cars & Trucks", 2.6, -1.9],
  ["CPIAPPSL", "Apparel", 2.5, 0.7],
  ["CPITRNSL", "Transportation Services", 5.9, 4.6],
  ["CUSR0000SEMD", "Hospital Services", 1.9, 4.0],
  ["CUSR0000SAS367", "Airline Fares", 0.8, -2.4],
  ["CPIRECSL", "Recreation", 5.2, 1.9],
  ["CUSR0000SAE1", "Education & Communication", 5.8, 1.2],
];

const PCE_COMPONENTS: [string, string, number, number][] = [
  ["DGDSRG3M086SBEA", "Goods", 33.5, 0.3],
  ["DSERRG3M086SBEA", "Services", 66.5, 3.4],
  ["DNRGRG3M086SBEA", "Energy Goods & Services", 4.1, -1.6],
  ["DFXARG3M086SBEA", "Food", 7.6, 2.0],
  ["DHUTRC1M027SBEA", "Housing & Utilities", 17.8, 3.7],
  ["DHLCRG3M086SBEA", "Health Care", 16.9, 2.9],
  ["DTRSRC1M027SBEA", "Transportation", 3.2, 1.4],
  ["DRCARC1M027SBEA", "Recreation", 3.6, 2.1],
];

function makeItem(id: string, label: string, group: InflationGroup, kind: InflationItem["kind"], weight: number, baseYoY: number): InflationItem {
  const rng = new Rng(`infl-${id}`);
  const yoy = Number((baseYoY + rng.normal(0, 0.15)).toFixed(2));
  const priorYoy = Number((yoy - rng.normal(0, 0.18)).toFixed(2));
  const mom = Number((yoy / 12 + rng.normal(0, 0.12)).toFixed(2));
  const priorMom = Number((mom - rng.normal(0, 0.14)).toFixed(2));
  const index = Number((100 * Math.pow(1 + yoy / 100, 4) + rng.float(180, 230)).toFixed(2));
  return {
    id, label, group, kind, weight,
    index, yoy, priorYoy, mom, priorMom,
    momAccel: Number((mom - priorMom).toFixed(2)),
    yoyAccel: Number((yoy - priorYoy).toFixed(2)),
    contribution: Number(((weight / 100) * yoy).toFixed(2)),
  };
}

export function getInflationHeadlines(): InflationItem[] {
  return HEADLINES.map(([id, label, group, base]) => makeItem(id, label, group, "HEADLINE", 100, base));
}

/**
 * Recompute an inflation item from a live FRED *index-level* series (units=lin),
 * deriving the index reading, MoM %, YoY % and their accelerations. Falls back to
 * the simulation `base` if the history is too short. Used to take the explorer
 * fully live on the face values, not just the drill-down.
 */
export function liveInflationItem(base: InflationItem, obs: { date: string; value: number }[]): InflationItem {
  const v = obs.map((o) => o.value);
  if (v.length < 14) return base;
  const n = v.length;
  const pct = (a: number, b: number) => (b ? (a / b - 1) * 100 : 0);
  const index = v[n - 1];
  const mom = pct(v[n - 1], v[n - 2]);
  const priorMom = pct(v[n - 2], v[n - 3]);
  const yoy = pct(v[n - 1], v[n - 13]);
  const priorYoy = pct(v[n - 2], v[n - 14]);
  return {
    ...base,
    index: Number(index.toFixed(2)),
    mom: Number(mom.toFixed(2)),
    priorMom: Number(priorMom.toFixed(2)),
    yoy: Number(yoy.toFixed(2)),
    priorYoy: Number(priorYoy.toFixed(2)),
    momAccel: Number((mom - priorMom).toFixed(2)),
    yoyAccel: Number((yoy - priorYoy).toFixed(2)),
    contribution: Number(((base.weight / 100) * yoy).toFixed(2)),
  };
}

export function getInflationComponents(group: "CPI" | "PCE"): InflationItem[] {
  const defs = group === "CPI" ? CPI_COMPONENTS : PCE_COMPONENTS;
  return defs.map(([id, label, weight, base]) => makeItem(id, label, group === "CPI" ? "CPI" : "PCE", "COMPONENT", weight, base)).sort((a, b) => b.weight - a.weight);
}

export interface InflationSummary {
  cpiYoY: number;
  coreCpiYoY: number;
  pceYoY: number;
  corePceYoY: number;
  cpiMoM: number;
  coreCpiMoM: number;
  hottestComponent: { label: string; yoy: number };
  coolestComponent: { label: string; yoy: number };
  acceleratingCount: number;
  deceleratingCount: number;
}

export function getInflationSummary(): InflationSummary {
  const h = getInflationHeadlines();
  const comps = getInflationComponents("CPI");
  const sorted = [...comps].sort((a, b) => b.yoy - a.yoy);
  const get = (g: InflationGroup) => h.find((x) => x.group === g)!;
  return {
    cpiYoY: get("CPI").yoy,
    coreCpiYoY: get("CORE_CPI").yoy,
    pceYoY: get("PCE").yoy,
    corePceYoY: get("CORE_PCE").yoy,
    cpiMoM: get("CPI").mom,
    coreCpiMoM: get("CORE_CPI").mom,
    hottestComponent: { label: sorted[0].label, yoy: sorted[0].yoy },
    coolestComponent: { label: sorted[sorted.length - 1].label, yoy: sorted[sorted.length - 1].yoy },
    acceleratingCount: comps.filter((c) => c.yoyAccel > 0).length,
    deceleratingCount: comps.filter((c) => c.yoyAccel < 0).length,
  };
}
