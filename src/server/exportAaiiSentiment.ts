/**
 * Build-time exporter for AAII Investor Sentiment Survey history.
 *
 * The connector uses AAII's published public sentiment pages/download target,
 * parses either CSV/TSV or the historical HTML table, and writes a committed
 * snapshot to `src/data/sentimentAaiiSnapshot.json`. If AAII blocks automated
 * access (for example Incapsula 403), the existing snapshot is preserved.
 *
 * Optional env:
 *   AAII_SENTIMENT_URL=https://www.aaii.com/...
 *
 * Run:
 *   npm run refresh:aaii-sentiment
 */
import fs from "node:fs";
import path from "node:path";
import { fetchWithProxyFallback } from "@/lib/server/fetchProxy";

interface AaiiWeek {
  date: string;
  bullish: number;
  neutral: number;
  bearish: number;
  spread: number;
}

interface AaiiSnapshotFile {
  schemaVersion: number;
  generatedAt: string | null;
  sourceUrl: string | null;
  source: "AAII";
  observations: AaiiWeek[];
}

const OUT = path.resolve(process.cwd(), "src/data/sentimentAaiiSnapshot.json");
const DEFAULT_URLS = [
  "https://www.aaii.com/sentimentsurvey/sent_results",
  "https://www.aaii.com/sentimentsurvey",
];

function readExisting(): AaiiSnapshotFile | null {
  try {
    return JSON.parse(fs.readFileSync(OUT, "utf8")) as AaiiSnapshotFile;
  } catch {
    return null;
  }
}

function atomicWriteJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

function parseNumber(raw: string): number | null {
  const clean = raw.replace(/[%,$"]/g, "").trim();
  if (!clean || clean === "-") return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw: string): string | null {
  const clean = raw.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const iso = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const us = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${year}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  const parsed = Date.parse(clean);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

function splitDelimitedLine(line: string, delimiter: "," | "\t"): string[] {
  if (delimiter === "\t") return line.split("\t").map((s) => s.trim());
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function headerIndex(headers: string[], patterns: RegExp[]): number {
  return headers.findIndex((h) => patterns.some((p) => p.test(h)));
}

function rowsFromTable(headers: string[], rows: string[][]): AaiiWeek[] {
  const normalized = headers.map((h) => h.toLowerCase().replace(/\s+/g, " ").trim());
  const dateI = headerIndex(normalized, [/date/, /week/]);
  const bullI = headerIndex(normalized, [/bullish/, /^bull/]);
  const neutralI = headerIndex(normalized, [/neutral/]);
  const bearI = headerIndex(normalized, [/bearish/, /^bear/]);
  const spreadI = headerIndex(normalized, [/spread/, /bull.*bear/]);
  if (dateI < 0 || bullI < 0 || neutralI < 0 || bearI < 0) return [];

  const out: AaiiWeek[] = [];
  for (const row of rows) {
    const date = parseDate(row[dateI] ?? "");
    const bullish = parseNumber(row[bullI] ?? "");
    const neutral = parseNumber(row[neutralI] ?? "");
    const bearish = parseNumber(row[bearI] ?? "");
    const providedSpread = spreadI >= 0 ? parseNumber(row[spreadI] ?? "") : null;
    if (!date || bullish == null || neutral == null || bearish == null) continue;
    out.push({
      date,
      bullish,
      neutral,
      bearish,
      spread: Number((providedSpread ?? bullish - bearish).toFixed(1)),
    });
  }
  return out;
}

function parseDelimited(text: string): AaiiWeek[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter: "," | "\t" = lines[0].includes("\t") ? "\t" : ",";
  const rows = lines.map((line) => splitDelimitedLine(line, delimiter));
  return rowsFromTable(rows[0], rows.slice(1));
}

function decodeHtml(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHtmlTable(html: string): AaiiWeek[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  for (const table of tables) {
    if (!/bullish|bearish|neutral/i.test(table)) continue;
    const trs = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    const parsed = trs.map((tr) => {
      const cells = tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? [];
      return cells.map(decodeHtml);
    }).filter((row) => row.length);
    if (parsed.length < 2) continue;
    const rows = rowsFromTable(parsed[0], parsed.slice(1));
    if (rows.length) return rows;
  }
  return [];
}

function findDownloadCandidates(html: string, baseUrl: string): string[] {
  const urls = new Set<string>();
  const linkRe = /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    const href = m[2];
    const label = decodeHtml(m[3]).toLowerCase();
    if (!/(download|historical|csv|excel|complete)/i.test(`${href} ${label}`)) continue;
    try {
      urls.add(new URL(href, baseUrl).toString());
    } catch {
      /* ignore malformed links */
    }
  }
  return [...urls];
}

async function fetchText(url: string): Promise<{ text: string; contentType: string }> {
  const response = await fetchWithProxyFallback(url, {
    cache: "no-store",
    headers: {
      accept: "text/csv,text/tab-separated-values,text/html,application/vnd.ms-excel,*/*",
      "user-agent": "MarketTerminalSnapshotBot/1.0 (+https://www.aaii.com/sentimentsurvey)",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return { text: await response.text(), contentType: response.headers.get("content-type") ?? "" };
}

async function tryUrl(url: string, seen = new Set<string>()): Promise<{ rows: AaiiWeek[]; url: string } | null> {
  if (seen.has(url)) return null;
  seen.add(url);
  const { text, contentType } = await fetchText(url);
  const delimited = /csv|excel|tab-separated|plain/i.test(contentType) || /^[^\n]*(,|\t)[^\n]*/.test(text)
    ? parseDelimited(text)
    : [];
  if (delimited.length) return { rows: delimited, url };

  const tableRows = parseHtmlTable(text);
  if (tableRows.length) return { rows: tableRows, url };

  for (const candidate of findDownloadCandidates(text, url)) {
    const nested = await tryUrl(candidate, seen).catch(() => null);
    if (nested?.rows.length) return nested;
  }
  return null;
}

async function main(): Promise<void> {
  const candidates = [process.env.AAII_SENTIMENT_URL, ...DEFAULT_URLS].filter(Boolean) as string[];
  const failures: string[] = [];
  for (const url of candidates) {
    try {
      const result = await tryUrl(url);
      if (!result?.rows.length) {
        failures.push(`${url}: no AAII rows found`);
        continue;
      }
      const byDate = new Map(result.rows.map((row) => [row.date, row]));
      const observations = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
      const payload: AaiiSnapshotFile = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        sourceUrl: result.url,
        source: "AAII",
        observations,
      };
      atomicWriteJson(OUT, payload);
      console.log(`AAII sentiment snapshot -> ${OUT}: ${observations.length} rows from ${result.url}`);
      return;
    } catch (err) {
      failures.push(`${url}: ${(err as Error).message}`);
    }
  }

  const existing = readExisting();
  const count = existing?.observations?.length ?? 0;
  console.warn(`AAII sentiment refresh did not fetch data. Preserving existing snapshot (${count} rows).`);
  for (const failure of failures) console.warn(`  ${failure}`);
}

void main();
