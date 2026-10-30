"""Loading of the Elexon CSV snapshots into in-memory structures."""
import csv
from bisect import bisect_right
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


@dataclass(frozen=True)
class Dataset:
    # target hour start (UTC) -> [(publish_time, MW)] sorted by publish_time
    forecasts: dict
    # half-hour start (UTC) -> MW
    actuals_hh: dict
    # hour start (UTC) -> MW, mean of the two half-hours (only when both exist)
    actuals_hourly: dict

    def latest_forecast(self, target: datetime, as_of: datetime):
        """Latest (publish_time, MW) for `target` published at or before `as_of`."""
        versions = self.forecasts.get(target)
        if not versions:
            return None
        i = bisect_right([p for p, _ in versions], as_of)
        return versions[i - 1] if i else None


def build_dataset(forecast_rows, actual_rows) -> Dataset:
    """rows: iterables of (publish_iso, start_iso, mw) and (start_iso, mw)."""
    forecasts: dict = {}
    for publish, start, mw in forecast_rows:
        forecasts.setdefault(parse_ts(start), []).append((parse_ts(publish), float(mw)))
    for versions in forecasts.values():
        versions.sort()

    actuals_hh = {parse_ts(s): float(mw) for s, mw in actual_rows}
    hourly = {}
    for start in actuals_hh:
        if start.minute == 0 and (start + timedelta(minutes=30)) in actuals_hh:
            hourly[start] = (actuals_hh[start] + actuals_hh[start + timedelta(minutes=30)]) / 2
    return Dataset(forecasts, actuals_hh, hourly)


@lru_cache(maxsize=1)
def load_dataset() -> Dataset:
    with (DATA_DIR / "wind_forecasts.csv").open() as f:
        fr = [(r["publishTime"], r["startTime"], r["generation"]) for r in csv.DictReader(f)]
    with (DATA_DIR / "wind_actuals.csv").open() as f:
        ar = [(r["startTime"], r["generation"]) for r in csv.DictReader(f)]
    return build_dataset(fr, ar)
