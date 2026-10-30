export interface Metrics {
  n: number;
  mae?: number;
  rmse?: number;
  bias?: number;
  mean_actual?: number;
  nmae_pct?: number | null;
  p05?: number;
  p10?: number;
  p50?: number;
  p90?: number;
  p95?: number;
}

export interface Meta {
  first_delivery: string;
  last_delivery: string;
  default_cutoff: string;
}

export interface Hour {
  start: string;
  forecast: number | null;
  actual: number | null;
  publish_time: string | null;
}

export interface Band {
  days: number;
  n: number;
  mae: number;
  p05: number;
  p10: number;
  p90: number;
  p95: number;
}

export interface Decision {
  delivery_date: string;
  gate_closure: string;
  forecast_published: string[];
  first_later_publish: string | null;
  hours: Hour[];
  band: Band | null;
  day_metrics: Metrics;
}

export interface Vintage {
  publish_time: string;
  values: { start: string; forecast: number }[];
}

export interface Accuracy {
  overall: Metrics;
  daily: (Metrics & { date: string })[];
  by_hour: (Metrics & { hour: number })[];
  histogram: { from: number; to: number; count: number }[];
  series: { start: string; forecast: number; actual: number }[];
}

export interface HorizonBucket extends Metrics {
  lead_from: number;
  lead_to: number;
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`/api/${path}?${new URLSearchParams(params)}`);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

export const api = {
  meta: () => get<Meta>("meta"),
  decision: (delivery_date: string, cutoff: string) => get<Decision>("decision", { delivery_date, cutoff }),
  vintages: (delivery_date: string) => get<Vintage[]>("vintages", { delivery_date }),
  accuracy: (cutoff: string) => get<Accuracy>("accuracy", { cutoff }),
  horizon: () => get<HorizonBucket[]>("horizon"),
};
