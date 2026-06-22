import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Connect, Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_ROOT = path.resolve(HERE, "../src/app/api");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

interface ApiRoute {
  /** Matches the request pathname, e.g. /api/market/SPX. */
  pattern: RegExp;
  /** Dynamic-segment names captured by the pattern, in order. */
  paramNames: string[];
  /** Absolute path to the route module. */
  modulePath: string;
}

/**
 * Walk `src/app/api` and turn every `route.ts` into an Express-style matcher,
 * mirroring Next's file-system routing: `[view]` becomes a `:view` param.
 */
function discoverRoutes(): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === "route.ts" || entry.name === "route.tsx") {
        const rel = path.relative(API_ROOT, path.dirname(full));
        const segments = rel ? rel.split(path.sep) : [];
        const paramNames: string[] = [];
        const parts = segments.map((seg) => {
          const dynamic = seg.match(/^\[(.+)\]$/);
          if (dynamic) {
            paramNames.push(dynamic[1]);
            return "([^/]+)";
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        });
        const pattern = new RegExp(`^/api${parts.length ? "/" + parts.join("/") : ""}/?$`);
        routes.push({ pattern, paramNames, modulePath: full });
      }
    }
  };
  walk(API_ROOT);
  // Longer (more specific) patterns first so static segments win over params.
  return routes.sort((a, b) => b.pattern.source.length - a.pattern.source.length);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function toWebRequest(req: IncomingMessage, url: URL, body?: Buffer): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (typeof value === "string") headers.set(key, value);
  }
  const method = (req.method ?? "GET").toUpperCase();
  const hasBody = body && body.length > 0 && method !== "GET" && method !== "HEAD";
  return new Request(url.toString(), {
    method,
    headers,
    ...(hasBody ? { body, duplex: "half" } : {}),
  } as RequestInit);
}

async function sendWebResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

/**
 * Vite plugin that serves the application's `src/app/api/**` route handlers as
 * dev-server middleware. Each handler is a standard Web `Request → Response`
 * function, loaded through `ssrLoadModule` so it shares the app's module graph,
 * aliases and hot-reloading. This replaces Next's API routes one-for-one.
 */
export function devApiPlugin(): Plugin {
  const routes = discoverRoutes();

  const attach = (server: ViteDevServer) => {
    const middleware: Connect.NextHandleFunction = (req, res, next) => {
      const rawUrl = req.url ?? "/";
      if (!rawUrl.startsWith("/api/") && rawUrl !== "/api") return next();

      void (async () => {
        try {
          const url = new URL(rawUrl, `http://${req.headers.host ?? "localhost"}`);
          const route = routes.find((r) => r.pattern.test(url.pathname));
          if (!route) return next();

          const match = url.pathname.match(route.pattern);
          const params: Record<string, string> = {};
          route.paramNames.forEach((name, i) => {
            params[name] = decodeURIComponent(match?.[i + 1] ?? "");
          });

          const mod = await server.ssrLoadModule(route.modulePath);
          const method = (req.method ?? "GET").toUpperCase();
          const handler = (mod[method] ?? (method === "HEAD" ? mod.GET : undefined)) as
            | ((request: Request, ctx: { params: Record<string, string> }) => Promise<Response> | Response)
            | undefined;

          if (typeof handler !== "function") {
            res.statusCode = 405;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ error: `Method ${method} not allowed` }));
            return;
          }

          const body = await readBody(req);
          const request = toWebRequest(req, url, body);
          const response = await handler(request, { params });
          await sendWebResponse(res, response);
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          // eslint-disable-next-line no-console
          console.error(`[dev-api] ${req.method} ${req.url} failed:`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
          }
          res.end(JSON.stringify({ error: (err as Error).message ?? "internal error" }));
        }
      })();
    };
    // Register directly (not via the returned post-hook) so it runs ahead of
    // Vite's SPA history-fallback and html middleware, which would otherwise
    // serve index.html for /api requests.
    server.middlewares.use(middleware);
  };

  return {
    name: "market-terminal-dev-api",
    configureServer(server) {
      attach(server);
    },
  };
}
