# Wind Forecast Desk

Decision-support web app for a GB utility's day-ahead power buying team. It answers two questions using
national wind data from Elexon BMRS only:

1. **What is the latest wind forecast I can actually use when I bid in the day-ahead auction?**
2. **How accurate are those forecasts, so I can plan around the error?**

**Live app:** https://asdfgh-beta.vercel.app

> **AI disclosure:** this project was built with the help of an AI coding assistant (Claude Code). I reviewed
> the code and the analysis choices described below.

## Key idea

A buyer bidding for delivery day *D* must decide on *D-1* before the auction gate closes (default **09:20 UK time**,
configurable in the UI). WINDFOR publishes eight forecast versions a day (02:30, 04:30, 07:30, 09:30, 11:30, 15:30,
18:30, 22:30), so at 09:20 the usable forecast is the **07:30** version; the 09:30 version arrives too late.
For every delivery hour the app selects the latest forecast published at or before the cutoff and compares it to actuals.

## Scope and assumptions

- "Decisions made in January 2026" = decisions taken 1–31 Jan, i.e. delivery days **2 Jan – 1 Feb 2026**.
- Actuals: FUELHH `fuelType=WIND`, half-hourly. WINDFOR is hourly, so actuals are averaged to the hour
  (both half-hours must exist).
- Error = forecast − actual (positive = over-forecast). Metrics: MAE, RMSE, bias, nMAE (% of mean actual), P05–P95 of error.
- The uncertainty band for a delivery day uses only errors from **earlier** delivery days (no look-ahead) and needs ≥ 2 days.
  It is shown as a P10–P90 range and a "plan-for low case" (wind should exceed it ~90% of the time).
- No demand data is used (out of scope). The optional demand box applies a flat MW figure to show `demand − wind`.
- January is GMT, so UK local time equals UTC; the code still uses `Europe/London` for gate closure and day boundaries.
- The data is a committed snapshot (`backend/data/*.csv`) so the deployed app is fast and reproducible and does not depend on
  Elexon being up. Refresh it with `python backend/scripts/fetch_data.py`.

## Headline findings (January 2026, 09:20 gate closure)

- MAE ≈ 2.0 GW (≈ 18% of average wind), RMSE ≈ 2.5 GW over 744 hourly decisions.
- The forecasts **over-predict by ≈ 1.7 GW on average**, so using the point forecast alone would under-buy firm power.
- Error grows with lead time (≈ 1.7 GW MAE at 0–4 h to ≈ 2.3 GW at 44–48 h), and the largest misses cluster on a few days.

## Files and directories

```
backend/
  app/data.py            CSV loading, hourly actuals, "latest forecast as of time T" lookup
  app/analysis.py        decision-time selection, metrics, uncertainty band, horizon analysis (pure functions)
  app/main.py            FastAPI routes: /api/meta, /decision, /vintages, /accuracy, /horizon, /health
  data/                  wind_forecasts.csv (WINDFOR) and wind_actuals.csv (FUELHH WIND) snapshots
  scripts/fetch_data.py  downloads the snapshots from the Elexon API (stdlib only)
  tests/                 pytest unit + API tests
  Dockerfile
frontend/
  src/App.tsx            shell, tabs, gate-closure control
  src/components/        DecisionView (forecast, band, versions, procurement table), AccuracyView (metrics + charts)
  src/api.ts             typed API client
  Dockerfile, nginx.conf serves the build and proxies /api to the backend
api/index.py             Vercel serverless entrypoint wrapping the FastAPI app
vercel.json              Vercel build and routing config
docker-compose.yml
```

## Run with Docker

```bash
docker compose up --build
# open http://localhost:8080
```

## Run locally without Docker

```bash
# backend (Python 3.10+)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# frontend (Node 18+), in another terminal
cd frontend
npm install
npm run dev            # http://localhost:5173, proxies /api to :8000
```

API docs: http://localhost:8000/api/docs

## Tests

```bash
cd backend && pip install pytest httpx && python -m pytest
```

## Deployment

Deployed on Vercel: static React build from `frontend/dist` plus the FastAPI app as a Python serverless function
(`api/index.py`, with `backend/**` bundled). Deploy with `vercel --prod` from the repo root.
