/**
 * Optional outbound-proxy support for the server's `fetch` calls (FRED, the
 * market pipeline, news services, …).
 *
 * Node's global `fetch` (undici) ignores the `HTTP(S)_PROXY` environment
 * variables that browsers/curl honour, so on a corporate network the browser
 * can reach an API while the app's `fetch` fails. When a proxy URL is
 * resolved we install an undici `ProxyAgent` as the global dispatcher, which
 * routes every server-side `fetch` through it. With nothing configured this is
 * a no-op and fetch behaves exactly as before.
 *
 * Resolution order (first match wins):
 *   1. Environment: FRED_PROXY_URL, then HTTPS_PROXY / HTTP_PROXY (any casing).
 *   2. A project-root file: PROXY_ENV_FILE (if set), else `.proxy`, else `.env`.
 *      The file uses `KEY=value` lines (dotenv-style); the same proxy keys are
 *      read from it. This covers runtimes where env vars aren't injected (e.g.
 *      `npm start`, where Vite's `.env` loader doesn't run).
 *
 * Server-only (loaded from the route registry / server entries, never the
 * client bundle), so the `undici` import is dynamic and externalised.
 */
import fs from "node:fs";
import path from "node:path";

let setup: Promise<void> | null = null;

const PROXY_KEYS = ["FRED_PROXY_URL", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"] as const;

function fromEnv(): string | undefined {
  for (const key of PROXY_KEYS) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
}

/** Parse a dotenv-style file into a flat map (ignores comments/blank lines). */
function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2"); // strip surrounding quotes
  }
  return out;
}

/** Fallback: read a proxy URL from a project-root config file. */
function fromFile(): { url: string; file: string } | undefined {
  const candidates = [process.env.PROXY_ENV_FILE, ".proxy", ".env"].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const file = path.resolve(process.cwd(), candidate);
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue; // file not present — try the next candidate
    }
    const vars = parseEnvFile(text);
    for (const key of PROXY_KEYS) {
      if (vars[key]) return { url: vars[key], file: candidate };
    }
  }
  return undefined;
}

/**
 * Install the proxy dispatcher once (memoised). Safe to await on every request.
 * Logs which mode is active so it's visible in the dev/server terminal.
 */
export function ensureProxy(): Promise<void> {
  if (setup) return setup;
  setup = (async () => {
    const envUrl = fromEnv();
    const fileMatch = envUrl ? undefined : fromFile();
    const url = envUrl ?? fileMatch?.url;
    if (!url) {
      console.log("[proxy] no proxy configured (env vars or .proxy/.env file) — server fetch goes direct");
      return;
    }
    const source = envUrl ? "environment" : `file ${fileMatch!.file}`;
    try {
      const { ProxyAgent, setGlobalDispatcher } = await import("undici");
      setGlobalDispatcher(new ProxyAgent(url));
      console.log(`[proxy] server fetch routed through ${url} (from ${source})`);
    } catch (err) {
      console.warn(`[proxy] failed to enable proxy ${url} (from ${source}): ${(err as Error).message}`);
    }
  })();
  return setup;
}
