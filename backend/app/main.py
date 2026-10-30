from datetime import date, time

from fastapi import FastAPI, HTTPException, Query

from . import analysis
from .analysis import iso
from .data import load_dataset

FIRST_DELIVERY = date(2026, 1, 2)  # first decision is made on 1 Jan
LAST_DELIVERY = date(2026, 2, 1)   # last decision is made on 31 Jan

app = FastAPI(title="Wind forecast decision support", docs_url="/api/docs", openapi_url="/api/openapi.json")


def _cutoff(value: str) -> time:
    try:
        return time.fromisoformat(value)
    except ValueError:
        raise HTTPException(422, "cutoff must be HH:MM (UK local time)")


def _delivery(d: date) -> date:
    if not FIRST_DELIVERY <= d <= LAST_DELIVERY:
        raise HTTPException(422, f"delivery date must be within {FIRST_DELIVERY} .. {LAST_DELIVERY}")
    return d


def _range(start: date, end: date):
    _delivery(start), _delivery(end)
    if start > end:
        raise HTTPException(422, "start must be <= end")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    return {
        "first_delivery": FIRST_DELIVERY.isoformat(),
        "last_delivery": LAST_DELIVERY.isoformat(),
        "default_cutoff": analysis.DEFAULT_CUTOFF.strftime("%H:%M"),
        "source": "Elexon BMRS: FUELHH (WIND actuals), WINDFOR (wind forecasts)",
    }


@app.get("/api/decision")
def decision(delivery_date: date, cutoff: str = "09:20"):
    """The forecast a buyer can use for `delivery_date`, with the uncertainty to plan around."""
    c = _cutoff(cutoff)
    ds = load_dataset()
    rows = analysis.decision_series(ds, _delivery(delivery_date), c)
    published = sorted({r["publish_time"] for r in rows if r["publish_time"]})
    # Newest forecast that exists but arrives too late for this auction (informational).
    gate = analysis.cutoff_for(delivery_date, c)
    later = sorted({p for h in analysis.delivery_hours(delivery_date)
                    for p, _ in ds.forecasts.get(h, []) if p > gate})
    return {
        "delivery_date": delivery_date.isoformat(),
        "cutoff": cutoff,
        "gate_closure": iso(gate),
        "forecast_published": [iso(p) for p in published],
        "first_later_publish": iso(later[0]) if later else None,
        "hours": [
            {"start": iso(r["start"]), "forecast": r["forecast"], "actual": r["actual"],
             "publish_time": iso(r["publish_time"]) if r["publish_time"] else None}
            for r in rows
        ],
        "band": analysis.uncertainty_band(ds, delivery_date, c),
        "day_metrics": analysis.metrics(analysis._pairs(rows)),
    }


@app.get("/api/vintages")
def vintages(delivery_date: date):
    return analysis.vintages(load_dataset(), _delivery(delivery_date))


@app.get("/api/accuracy")
def accuracy(start: date = FIRST_DELIVERY, end: date = LAST_DELIVERY, cutoff: str = "09:20"):
    _range(start, end)
    return analysis.accuracy(load_dataset(), start, end, _cutoff(cutoff))


@app.get("/api/horizon")
def horizon(start: date = FIRST_DELIVERY, end: date = LAST_DELIVERY, bucket_hours: int = Query(4, ge=1, le=24)):
    _range(start, end)
    return analysis.horizon_accuracy(load_dataset(), start, end, bucket_hours)
