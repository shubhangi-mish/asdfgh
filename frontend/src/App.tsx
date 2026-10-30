import { useEffect, useState } from "react";
import { api, Meta } from "./api";
import AccuracyView from "./components/AccuracyView";
import DecisionView from "./components/DecisionView";
import { Loading } from "./components/ui";

type Tab = "decision" | "accuracy";

export default function App() {
  const [tab, setTab] = useState<Tab>(location.hash === "#accuracy" ? "accuracy" : "decision");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [cutoff, setCutoff] = useState("09:20");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.meta().then((m) => { setMeta(m); setCutoff(m.default_cutoff); }).catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="app">
      <header>
        <div>
          <h1>Wind Forecast Desk</h1>
          <p>GB day-ahead buying · what wind will deliver, and how far to trust it</p>
        </div>
        <label className="cutoff">
          Auction gate closure (UK time, day before delivery)
          <input type="time" value={cutoff} onChange={(e) => e.target.value && setCutoff(e.target.value)} />
        </label>
      </header>

      <nav>
        <button className={tab === "decision" ? "active" : ""} onClick={() => { setTab("decision"); location.hash = ""; }}>Day-ahead decision</button>
        <button className={tab === "accuracy" ? "active" : ""} onClick={() => { setTab("accuracy"); location.hash = "accuracy"; }}>Forecast accuracy</button>
      </nav>

      <main>
        {!meta ? <Loading error={error} /> :
          tab === "decision" ? <DecisionView meta={meta} cutoff={cutoff} /> : <AccuracyView cutoff={cutoff} />}
      </main>

      <footer>Data: Elexon BMRS (FUELHH wind actuals, WINDFOR wind forecasts), national level, January 2026 decisions.</footer>
    </div>
  );
}
