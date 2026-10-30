export const mw = (v?: number | null) => (v == null ? "–" : `${Math.round(v).toLocaleString("en-GB")} MW`);
export const gw = (v?: number | null) => (v == null ? "–" : `${(v / 1000).toFixed(1)} GW`);
export const signed = (v?: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("en-GB")} MW`);
export const pct = (v?: number | null) => (v == null ? "–" : `${v.toFixed(1)}%`);

// Timestamps are UTC; UK local time equals UTC throughout January (GMT).
export const hhmm = (iso: string) => iso.slice(11, 16);
export const dayHhmm = (iso: string) => `${iso.slice(8, 10)} Jan ${iso.slice(11, 16)}`;
export const shortDate = (d: string) => `${d.slice(8, 10)} Jan`;
