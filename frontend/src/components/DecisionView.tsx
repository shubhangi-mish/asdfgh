import { useEffect, useMemo, useState } from "react";
import {
  Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api, Decision, Meta, Vintage } from "../api";
import { dayHhmm, gw, hhmm, mw, pct, signed } from "../format";
import { Card, COLORS, Loading, Stat } from "./ui";

interface Props {
  meta: Meta;
  cutoff: string;
}

export default function DecisionView({ meta, cutoff }: Props) {
  const [date, setDate] = useState("2026-01-15");
  const [demand, setDemand] = useState("");
  const [data, setData] = useState<Decision | null>(null);
  const [vintages, setVintages] = useState<Vintage[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    Promise.all([api.decision(date, cutoff), api.vintages(date)])
      .then(([d, v]) => { setData(d); setVintages(v); })
      .catch((e) => setError(String(e)));
  }, [date, cutoff]);

  const rows = useMemo(() => {
    if (!data) return [];
    const b = data.band;
    return data.hours.map((h) => {
      // error = forecast - actual, so actual = forecast - error.
      const low = h.forecast != null && b ? Math.max(0, h.forecast - b.p90) : null;
      const high = h.forecast != null && b ? h.forecast - b.p10 : null;
      return { ...h, time: hhmm(h.start), low, band: low != null && high != null ? [low, high] : null };
    });
  }, [data]);

  const d = Number(demand);
  const hasDemand = demand !== "" && d > 0;

  const evolution = useMemo(() => {
    const byTime: Record<string, Record<string, number | string>> = {};
    vintages.forEach((v) => v.values.forEach(({ start, forecast }) => {
      byTime[start] ??= { time: hhmm(start) };
      byTime[start]["v" + v.publish_time] = forecast;
    }));
    return Object.keys(byTime).sort().map((k) => byTime[k]);
  }, [vintages]);

  const usedPublish = data?.forecast_published[data.forecast_published.length - 1];

  return (
    <>
      <div className="controls">
        <label>
          Delivery day (decision made the day before)
          <input type="date" value={date} min={meta.first_delivery} max={meta.last_delivery}
                 onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
        <label>
          Your expected demand, MW (optional)
          <input type="number" min="0" step="500" placeholder="e.g. 20000" value={demand}
                 onChange={(e) => setDemand(e.target.value)} />
        </label>
      </div>

      {!data ? <Loading error={error} /> : (
        <>
          <div className="stats">
            <Stat label="Forecast to use"
                  value={usedPublish ? `Published ${dayHhmm(usedPublish)}` : "None available"}
                  hint={`Latest before gate closure ${dayHhmm(data.gate_closure)}`} />
            <Stat label="Average forecast wind" value={gw(avg(data.hours.map((h) => h.forecast)))} hint="over the 24 delivery hours" />
            <Stat label="Plan-for low case (P10)"
                  value={data.band ? gw(avg(rows.map((r) => r.low))) : "n/a"}
                  hint={data.band ? `wind should exceed this ~90% of the time` : "needs ≥2 earlier days of history"} />
            <Stat label="Typical forecast error" value={data.band ? mw(data.band.mae) : "n/a"}
                  hint={data.band ? `MAE over ${data.band.days} previous days` : undefined} />
          </div>

          {data.first_later_publish && (
            <p className="note">
              A newer forecast appears at {dayHhmm(data.first_later_publish)}, after the auction closes — it cannot inform this purchase.
            </p>
          )}

          <Card title="Wind forecast for the delivery day"
                subtitle={data.band
                  ? `Shaded band: range wind has actually fallen in 80% of the previous ${data.band.days} days' decisions (P10–P90 of past errors, no look-ahead).`
                  : "Uncertainty band appears once at least 2 earlier delivery days exist."}>
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" interval={1} />
                <YAxis tickFormatter={(v) => `${v / 1000}`} label={{ value: "GW", angle: -90, position: "insideLeft" }} />
                <Tooltip formatter={(v: number | number[], name) => Array.isArray(v) ? `${mw(v[0])} – ${mw(v[1])}` : mw(v)} />
                <Legend />
                <Area dataKey="band" name="Likely range (P10–P90)" stroke="none" fill={COLORS.band} fillOpacity={0.45} connectNulls />
                <Line dataKey="forecast" name="Forecast" stroke={COLORS.forecast} strokeWidth={2.5} dot={false} />
                <Line dataKey="actual" name="Actual (revealed after delivery)" stroke={COLORS.actual} strokeWidth={2} dot={false} strokeDasharray="5 3" />
              </ComposedChart>
            </ResponsiveContainer>
            {data.day_metrics.n > 0 && (
              <p className="subtitle">
                Hindsight for this day: MAE {mw(data.day_metrics.mae)}, bias {signed(data.day_metrics.bias)} ({pct(data.day_metrics.nmae_pct)} of average wind).
              </p>
            )}
          </Card>

          <Card title="How the forecast changed before the auction"
                subtitle="Each line is a forecast version for this delivery day. Dark line = the version a buyer can use; paler lines are earlier or later versions.">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={evolution} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="time" interval={1} />
                <YAxis tickFormatter={(v) => `${v / 1000}`} label={{ value: "GW", angle: -90, position: "insideLeft" }} />
                <Tooltip formatter={(v: number) => mw(v)} labelFormatter={(l) => `Delivery hour ${l}`} />
                {vintages.map((v) => {
                  const used = v.publish_time === usedPublish;
                  const late = v.publish_time > data.gate_closure;
                  return (
                    <Line key={v.publish_time} dataKey={"v" + v.publish_time} name={`Published ${dayHhmm(v.publish_time)}`}
                          stroke={used ? COLORS.forecast : late ? "#cbd5e1" : COLORS.muted}
                          strokeWidth={used ? 3 : 1} dot={false} strokeDasharray={late ? "4 3" : undefined} isAnimationActive={false} />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Procurement view"
                subtitle={hasDemand
                  ? `Power to buy from other sources (e.g. thermal) = demand − wind. Flat demand of ${mw(d)} assumed; no demand data is part of this pilot.`
                  : "Enter an expected demand above to see how much non-wind power must be bought each hour."}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Hour</th><th>Forecast wind</th><th>Low case (P10)</th>
                    {hasDemand && <><th>Buy (forecast)</th><th>Buy (cautious)</th></>}
                    <th>Actual</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.start}>
                      <td>{r.time}</td>
                      <td>{mw(r.forecast)}</td>
                      <td>{mw(r.low)}</td>
                      {hasDemand && <>
                        <td>{r.forecast != null ? mw(Math.max(0, d - r.forecast)) : "–"}</td>
                        <td><strong>{r.low != null ? mw(Math.max(0, d - r.low)) : "–"}</strong></td>
                      </>}
                      <td>{mw(r.actual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}

function avg(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
