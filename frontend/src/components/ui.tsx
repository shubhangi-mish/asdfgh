import { ReactNode } from "react";

export const COLORS = {
  forecast: "#2563eb",
  actual: "#ea580c",
  band: "#93c5fd",
  muted: "#94a3b8",
  bias: "#7c3aed",
};

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {subtitle && <p className="subtitle">{subtitle}</p>}
      {children}
    </section>
  );
}

export function Loading({ error }: { error?: string | null }) {
  return <p className={error ? "error" : "muted"}>{error ? `Could not load data: ${error}` : "Loading…"}</p>;
}
