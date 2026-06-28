import { json } from "@/lib/server/http";
import { getPolyEvents } from "@/data/polymarket";

export async function GET() {
  return json({ source: "SIM", data: getPolyEvents() });
}
