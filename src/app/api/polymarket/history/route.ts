import { json } from "@/lib/server/http";
import { getPolyPriceHistory } from "@/data/polymarket";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "poly-000";
  const days = Number(url.searchParams.get("days") ?? 90);

  return json({ source: "SIM", data: getPolyPriceHistory(id, days) });
}
