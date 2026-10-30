"""Download Elexon wind data into small CSV snapshots under backend/data.

Usage:  python backend/scripts/fetch_data.py

Scope: purchase decisions made in January 2026, i.e. delivery days 2 Jan - 1 Feb 2026.
- WINDFOR: every forecast published 1 Jan - 31 Jan 2026 (the pool of forecasts a buyer
  could have seen), all target hours.
- FUELHH:  WIND actuals (half-hourly) for 1 Jan - 2 Feb 2026.

Only the standard library is used so the script runs anywhere.
"""
import csv
import json
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
DATA_DIR = Path(__file__).resolve().parents[1] / "data"

FORECAST_FROM = datetime(2026, 1, 1)
FORECAST_TO = datetime(2026, 2, 1)  # exclusive: last publish is 31 Jan 22:30
ACTUALS_FROM = date(2026, 1, 1)
ACTUALS_TO = date(2026, 2, 2)


def get_json(dataset: str, params: dict):
    url = f"{BASE}/{dataset}/stream?{urllib.parse.urlencode(params)}"
    print("GET", url)
    with urllib.request.urlopen(url, timeout=120) as resp:
        return json.load(resp)


def fetch_forecasts():
    rows, cursor = {}, FORECAST_FROM
    while cursor < FORECAST_TO:  # weekly chunks keep each response small
        end = min(cursor + timedelta(days=7), FORECAST_TO)
        data = get_json("WINDFOR", {
            "publishDateTimeFrom": cursor.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "publishDateTimeTo": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "format": "json",
        })
        for r in data:
            rows[(r["publishTime"], r["startTime"])] = r["generation"]
        cursor = end
    return sorted((p, s, g) for (p, s), g in rows.items())


def fetch_actuals():
    rows, cursor = {}, ACTUALS_FROM
    while cursor < ACTUALS_TO:
        end = min(cursor + timedelta(days=10), ACTUALS_TO)
        data = get_json("FUELHH", {
            "settlementDateFrom": cursor.isoformat(),
            "settlementDateTo": end.isoformat(),
            "fuelType": "WIND",
            "format": "json",
        })
        for r in data:
            rows[r["startTime"]] = r["generation"]
        cursor = end
    return sorted(rows.items())


def write_csv(path: Path, header: list, rows: list):
    with path.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)
    print(f"wrote {len(rows)} rows -> {path}")


if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    write_csv(DATA_DIR / "wind_forecasts.csv", ["publishTime", "startTime", "generation"], fetch_forecasts())
    write_csv(DATA_DIR / "wind_actuals.csv", ["startTime", "generation"], fetch_actuals())
