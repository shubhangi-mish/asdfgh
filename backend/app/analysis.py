"""Decision-time forecast selection and forecast-accuracy metrics.

Key idea: a buyer bidding in the day-ahead auction for delivery day D can only use
forecasts published before the gate closure on D-1 (default 09:20 UK time). For every
target hour we therefore take the LATEST forecast published at or before that cutoff, and
compare it to what actually happened. Forecasts published later are irrelevant for the buy.
"""
import math
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from .data import Dataset

LONDON = ZoneInfo("Europe/London")
DEFAULT_CUTOFF = time(9, 20)
MIN_HISTORY_DAYS = 2  # trailing days needed before an uncertainty band is shown


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def cutoff_for(delivery: date, cutoff: time) -> datetime:
    """Gate closure instant: `cutoff` UK local time on the day before delivery."""
    local = datetime.combine(delivery - timedelta(days=1), cutoff, tzinfo=LONDON)
    return local.astimezone(timezone.utc)


def delivery_hours(delivery: date) -> list:
    """UTC start instants of every hour of the UK-local delivery day (23-25 on DST days)."""
    start = datetime.combine(delivery, time(0), tzinfo=LONDON).astimezone(timezone.utc)
    end = datetime.combine(delivery + timedelta(days=1), time(0), tzinfo=LONDON).astimezone(timezone.utc)
    hours, t = [], start
    while t < end:
        hours.append(t)
        t += timedelta(hours=1)
    return hours


def decision_series(ds: Dataset, delivery: date, cutoff: time = DEFAULT_CUTOFF) -> list:
    """Per target hour: the forecast available at the cutoff, plus the actual if known."""
    as_of = cutoff_for(delivery, cutoff)
    rows = []
    for h in delivery_hours(delivery):
        fc = ds.latest_forecast(h, as_of)
        rows.append({
            "start": h,
            "forecast": fc[1] if fc else None,
            "publish_time": fc[0] if fc else None,
            "actual": ds.actuals_hourly.get(h),
        })
    return rows


def _quantile(sorted_vals: list, q: float) -> float:
    if not sorted_vals:
        return float("nan")
    pos = (len(sorted_vals) - 1) * q
    lo, hi = math.floor(pos), math.ceil(pos)
    return sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * (pos - lo)


def metrics(pairs: list) -> dict:
    """pairs: [(forecast, actual)]. Error = forecast - actual (positive = over-forecast)."""
    n = len(pairs)
    if n == 0:
        return {"n": 0}
    errs = sorted(f - a for f, a in pairs)
    mean_actual = sum(a for _, a in pairs) / n
    mae = sum(abs(e) for e in errs) / n
    rmse = math.sqrt(sum(e * e for e in errs) / n)
    return {
        "n": n,
        "mae": mae,
        "rmse": rmse,
        "bias": sum(errs) / n,
        "mean_actual": mean_actual,
        "nmae_pct": 100 * mae / mean_actual if mean_actual else None,
        "p05": _quantile(errs, 0.05),
        "p10": _quantile(errs, 0.10),
        "p50": _quantile(errs, 0.50),
        "p90": _quantile(errs, 0.90),
        "p95": _quantile(errs, 0.95),
        "max_over": errs[-1],
        "max_under": errs[0],
    }


def _pairs(rows: list) -> list:
    return [(r["forecast"], r["actual"]) for r in rows if r["forecast"] is not None and r["actual"] is not None]


def uncertainty_band(ds: Dataset, delivery: date, cutoff: time = DEFAULT_CUTOFF) -> dict | None:
    """Forecast-error quantiles from delivery days strictly BEFORE `delivery` (no look-ahead)."""
    pairs, days, d = [], 0, delivery - timedelta(days=1)
    while d >= date(2026, 1, 2) and days < 30:
        p = _pairs(decision_series(ds, d, cutoff))
        if p:
            pairs += p
            days += 1
        d -= timedelta(days=1)
    if days < MIN_HISTORY_DAYS:
        return None
    m = metrics(pairs)
    return {"days": days, "n": m["n"], "mae": m["mae"], "p10": m["p10"], "p90": m["p90"], "p05": m["p05"], "p95": m["p95"]}


def accuracy(ds: Dataset, start: date, end: date, cutoff: time = DEFAULT_CUTOFF) -> dict:
    """Accuracy of the decision-time forecast over delivery days start..end inclusive."""
    all_rows, daily = [], []
    d = start
    while d <= end:
        rows = decision_series(ds, d, cutoff)
        p = _pairs(rows)
        if p:
            m = metrics(p)
            daily.append({"date": d.isoformat(), **m})
        all_rows += rows
        d += timedelta(days=1)

    by_hour = {}
    for r in all_rows:
        if r["forecast"] is not None and r["actual"] is not None:
            by_hour.setdefault(r["start"].astimezone(LONDON).hour, []).append((r["forecast"], r["actual"]))

    errors = [f - a for f, a in _pairs(all_rows)]
    series = [
        {"start": iso(r["start"]), "forecast": r["forecast"], "actual": r["actual"]}
        for r in all_rows if r["forecast"] is not None and r["actual"] is not None
    ]
    return {
        "overall": metrics(_pairs(all_rows)),
        "daily": daily,
        "by_hour": [{"hour": h, **metrics(p)} for h, p in sorted(by_hour.items())],
        "histogram": histogram(errors),
        "series": series,
    }


def histogram(errors: list, width: int = 1000) -> list:
    if not errors:
        return []
    lo = math.floor(min(errors) / width) * width
    hi = math.ceil(max(errors) / width) * width
    bins = {b: 0 for b in range(lo, hi + width, width)}
    for e in errors:
        bins[math.floor(e / width) * width] += 1
    return [{"from": b, "to": b + width, "count": c} for b, c in sorted(bins.items())]


def horizon_accuracy(ds: Dataset, start: date, end: date, bucket_h: int = 4, max_h: int = 48) -> list:
    """Accuracy of EVERY published forecast in the window, grouped by lead time
    (target start - publish time). Shows how error shrinks as delivery approaches."""
    lo = datetime.combine(start, time(0), tzinfo=LONDON).astimezone(timezone.utc)
    hi = datetime.combine(end + timedelta(days=1), time(0), tzinfo=LONDON).astimezone(timezone.utc)
    buckets: dict = {}
    for target, versions in ds.forecasts.items():
        actual = ds.actuals_hourly.get(target)
        if actual is None or not (lo <= target < hi):
            continue
        for publish, mw in versions:
            lead = (target - publish).total_seconds() / 3600
            if lead < 0 or lead >= max_h:
                continue
            buckets.setdefault(int(lead // bucket_h) * bucket_h, []).append((mw, actual))
    return [{"lead_from": b, "lead_to": b + bucket_h, **metrics(p)} for b, p in sorted(buckets.items())]


def vintages(ds: Dataset, delivery: date) -> list:
    """Every forecast version published for the delivery day, newest last."""
    hours = delivery_hours(delivery)
    by_publish: dict = {}
    for h in hours:
        for publish, mw in ds.forecasts.get(h, []):
            by_publish.setdefault(publish, {})[h] = mw
    return [
        {"publish_time": iso(p), "values": [{"start": iso(h), "forecast": v[h]} for h in hours if h in v]}
        for p, v in sorted(by_publish.items())
    ]
