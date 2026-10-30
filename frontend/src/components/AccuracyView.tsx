import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Accuracy, api, HorizonBucket } from "../api";
import { mw, pct, shortDate, signed } from "../format";
import { Card, COLORS, Loading, Stat } from "./ui";

const gwTick = (v: number) => `${v / 1000}`;
const yGw = { value: "GW", angle: -90, position: "insideLeft" } as const;
const yMw = { value: "MW", angle: -90, position: "insideLeft" } as const;

export default function AccuracyView({ cutoff }: { cutoff: string }) {
  const [acc, setAcc] = useState<Accuracy | null>(null);
  const [horizon, setHorizon] = useState<HorizonBucket[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAcc(null);
    Promise.all([api.accuracy(cutoff), api.horizon()])
      .then(([a, h]) => { setAcc(a); setHorizon(h); })
      .catch((e) => setError(String(e)));
  }, [cutoff]);

  if (!acc) return <Loading error={error} />;
  const o = acc.overall;
  const over = (o.bias ?? 0) > 0;

  return (
    <>
      <div className="stats">
        <Stat label="Mean absolute error" value={mw(o.mae)} hint={`${pct(o.nmae_pct)} of average wind`} />
        <Stat label="RMSE" value={mw(o.rmse)} hint="penalises large misses" />
        <Stat label="Bias (forecast − actual)" value={signed(o.bias)} hint={over ? "forecasts run too high" : "forecasts run too low"} />
        <Stat label="90% of misses within" value={`${mw(o.p10)} … ${mw(o.p90)}`} hint="P10 … P90 of error" />
      </div>

      <p className="note">
        <strong>Reading this:</strong> across {o.n} hourly decisions in January, the forecast available at gate closure was on
        average {mw(Math.abs(o.bias ?? 0))} {over ? "higher" : "lower"} than actual wind (average wind {mw(o.mean_actual)}).
        {over && " Trusting it uncorrected would under-buy non-wind power."} Plan with the low case, not the point forecast.
      </p>

      <Card title="Forecast vs actual, January" subtitle={`Decision-time forecast (latest published before ${cutoff} UK time on the day before delivery).`}>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={acc.series} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="start" tickFormatter={(s: string) => shortDate(s)} minTickGap={40} />
            <YAxis tickFormatter={gwTick} label={yGw} />
            <Tooltip labelFormatter={(s: string) => `${shortDate(s)} ${s.slice(11, 16)}`} formatter={(v: number) => mw(v)} />
            <Legend />
            <Line dataKey="forecast" name="Forecast at decision time" stroke={COLORS.forecast} dot={false} strokeWidth={1.5} isAnimationActive={false} />
            <Line dataKey="actual" name="Actual" stroke={COLORS.actual} dot={false} strokeWidth={1.5} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid2">
        <Card title="Error by delivery day" subtitle="MAE (bars) and bias (line), MW.">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={acc.daily} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={20} />
              <YAxis label={yMw} />
              <Tooltip labelFormatter={shortDate} formatter={(v: number) => mw(v)} />
              <Legend />
              <ReferenceLine y={0} stroke="#64748b" />
              <Bar dataKey="mae" name="MAE" fill={COLORS.forecast} />
              <Line dataKey="bias" name="Bias" stroke={COLORS.bias} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Error by hour of day" subtitle="Is the forecast worse at particular times?">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={acc.by_hour} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="hour" />
              <YAxis label={yMw} />
              <Tooltip formatter={(v: number) => mw(v)} labelFormatter={(h) => `Hour ${h}:00`} />
              <Legend />
              <ReferenceLine y={0} stroke="#64748b" />
              <Bar dataKey="mae" name="MAE" fill={COLORS.forecast} />
              <Line dataKey="bias" name="Bias" stroke={COLORS.bias} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Error distribution" subtitle="Hours per 1 GW error bucket (forecast − actual). Right of zero = over-forecast.">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={acc.histogram} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="from" tickFormatter={gwTick} />
              <YAxis allowDecimals={false} />
              <Tooltip labelFormatter={(f) => `${mw(Number(f))} to ${mw(Number(f) + 1000)}`} />
              <ReferenceLine x={0} stroke="#64748b" />
              <Bar dataKey="count" name="Hours" fill={COLORS.forecast} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Error vs forecast lead time" subtitle="Every published forecast, grouped by hours between publication and delivery hour.">
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={horizon.map((h) => ({ ...h, label: `${h.lead_from}–${h.lead_to}h` }))} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" />
              <YAxis label={yMw} />
              <Tooltip formatter={(v: number) => mw(v)} />
              <Legend />
              <Bar dataKey="mae" name="MAE" fill={COLORS.forecast} />
              <Line dataKey="rmse" name="RMSE" stroke={COLORS.actual} strokeWidth={2} dot />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="Method" subtitle="How these numbers are produced">
        <ul className="method">
          <li>Actuals: FUELHH WIND, half-hourly; averaged to the hour to match the hourly WINDFOR forecasts.</li>
          <li>Decision-time forecast: for each delivery hour, the latest WINDFOR publication at or before {cutoff} UK time on the previous day.</li>
          <li>Error = forecast − actual. MAE and RMSE in MW; nMAE = MAE ÷ mean actual wind.</li>
          <li>Scope: purchase decisions made 1–31 January 2026 (delivery 2 Jan – 1 Feb).</li>
        </ul>
      </Card>
    </>
  );
}
