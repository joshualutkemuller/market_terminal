import { json } from "@/lib/server/http";
import { getPolymarkets } from "@/data/polymarket";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const category = url.searchParams.get("category") ?? undefined;

  let markets = getPolymarkets();
  if (category) markets = markets.filter((m) => m.category === category);
  if (limit) markets = markets.slice(0, limit);

  return json({ source: "SIM", data: markets });
}
