import { useEffect, useState } from "react";
import { fetchJson, peekFresh } from "@/lib/fetchCache";
import {
  getPolymarkets,
  getPolyEvents,
  getPolyPriceHistory,
  type PolyMarket,
  type PolyEvent,
  type PolyPricePoint,
} from "@/data/polymarket";

export type PolySource = "POLY" | "SNAPSHOT" | "SIM" | "LOADING";

function mapSource(raw?: string): PolySource {
  if (raw === "POLY" || raw === "LIVE") return "POLY";
  if (raw === "SNAPSHOT") return "SNAPSHOT";
  return "SIM";
}

export function usePolymarkets(opts?: { limit?: number; category?: string }): {
  data: PolyMarket[];
  source: PolySource;
} {
  const limit = opts?.limit ?? 100;
  const category = opts?.category;
  const sim = getPolymarkets().slice(0, limit);
  const filtered = category ? sim.filter((m) => m.category === category) : sim;

  const url = `/api/polymarket/markets?limit=${limit}${category ? `&category=${category}` : ""}`;
  const cached = peekFresh<any>(url);
  const [data, setData] = useState<PolyMarket[]>(cached?.data ?? filtered);
  const [source, setSource] = useState<PolySource>(cached ? mapSource(cached.source) : "SIM");

  useEffect(() => {
    let alive = true;
    const seed = peekFresh<any>(url);
    if (seed) {
      setData(seed.data ?? filtered);
      setSource(mapSource(seed.source));
    } else {
      setSource("LOADING");
    }

    fetchJson<any>(url)
      .then((json) => {
        if (!alive) return;
        setData(json.data ?? filtered);
        setSource(mapSource(json.source));
      })
      .catch(() => {
        if (!alive) return;
        setData(filtered);
        setSource("SIM");
      });

    return () => { alive = false; };
  }, [limit, category]);

  return { data, source };
}

export function usePolyEvents(): {
  data: PolyEvent[];
  source: PolySource;
} {
  const sim = getPolyEvents();
  const url = "/api/polymarket/events";
  const cached = peekFresh<any>(url);
  const [data, setData] = useState<PolyEvent[]>(cached?.data ?? sim);
  const [source, setSource] = useState<PolySource>(cached ? mapSource(cached.source) : "SIM");

  useEffect(() => {
    let alive = true;
    const seed = peekFresh<any>(url);
    if (seed) {
      setData(seed.data ?? sim);
      setSource(mapSource(seed.source));
    } else {
      setSource("LOADING");
    }

    fetchJson<any>(url)
      .then((json) => {
        if (!alive) return;
        setData(json.data ?? sim);
        setSource(mapSource(json.source));
      })
      .catch(() => {
        if (!alive) return;
        setData(sim);
        setSource("SIM");
      });

    return () => { alive = false; };
  }, []);

  return { data, source };
}

export function usePolyHistory(marketId: string | null, days = 90): {
  data: PolyPricePoint[];
  source: PolySource;
} {
  const sim = marketId ? getPolyPriceHistory(marketId, days) : [];
  const [data, setData] = useState<PolyPricePoint[]>(sim);
  const [source, setSource] = useState<PolySource>("SIM");

  useEffect(() => {
    if (!marketId) {
      setData([]);
      setSource("SIM");
      return;
    }

    let alive = true;
    const url = `/api/polymarket/history?id=${marketId}&days=${days}`;
    const seed = peekFresh<any>(url);
    if (seed) {
      setData(seed.data ?? sim);
      setSource(mapSource(seed.source));
    } else {
      setData(getPolyPriceHistory(marketId, days));
      setSource("LOADING");
    }

    fetchJson<any>(url)
      .then((json) => {
        if (!alive) return;
        setData(json.data ?? []);
        setSource(mapSource(json.source));
      })
      .catch(() => {
        if (!alive) return;
        setData(getPolyPriceHistory(marketId, days));
        setSource("SIM");
      });

    return () => { alive = false; };
  }, [marketId, days]);

  return { data, source };
}
