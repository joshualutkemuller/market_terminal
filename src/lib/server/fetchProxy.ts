/**
 * Optional outbound-proxy support for the server's `fetch` calls (FRED, the
 * market pipeline, news services, …).
 *
 * Node's global `fetch` (undici) ignores the `HTTP(S)_PROXY` environment
 * variables that browsers/curl honour, so on a corporate network the browser
 * can reach an API while the app's `fetch` fails. When a proxy URL is
 * configured we install an undici `ProxyAgent` as the global dispatcher, which
 * routes every server-side `fetch` through it. With no proxy configured this is
 * a no-op and fetch behaves exactly as before.
 *
 * Configure via env (first match wins):
 *   FRED_PROXY_URL   – explicit proxy for this app (recommended)
 *   HTTPS_PROXY / https_proxy / HTTP_PROXY / http_proxy – standard proxy vars
 *
 * This module is server-only (loaded from the route registry / server entries,
 * never the client bundle), so the `undici` import is dynamic and externalised.
 */
let setup: Promise<void> | null = null;

function proxyUrl(): string | undefined {
  return (
    process.env.FRED_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    undefined
  );
}

/**
 * Install the proxy dispatcher once (memoised). Safe to await on every request.
 * Logs which mode is active so it's visible in the dev/server terminal.
 */
export function ensureProxy(): Promise<void> {
  if (setup) return setup;
  setup = (async () => {
    const url = proxyUrl();
    if (!url) {
      console.log("[proxy] no proxy configured — server fetch goes direct");
      return;
    }
    try {
      const { ProxyAgent, setGlobalDispatcher } = await import("undici");
      setGlobalDispatcher(new ProxyAgent(url));
      console.log(`[proxy] server fetch routed through ${url}`);
    } catch (err) {
      console.warn(`[proxy] failed to enable proxy ${url}: ${(err as Error).message}`);
    }
  })();
  return setup;
}
