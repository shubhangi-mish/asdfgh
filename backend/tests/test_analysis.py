from datetime import date, datetime, time, timezone

import pytest
from fastapi.testclient import TestClient

from app import analysis
from app.data import build_dataset
from app.main import app


def utc(s):
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


@pytest.fixture
def ds():
    # Target 2026-01-10 12:00 has three forecast vintages around the 09:20 gate on 9 Jan.
    forecasts = [
        ("2026-01-09T04:30:00Z", "2026-01-10T12:00:00Z", 100),
        ("2026-01-09T07:30:00Z", "2026-01-10T12:00:00Z", 200),
        ("2026-01-09T09:30:00Z", "2026-01-10T12:00:00Z", 300),  # too late for the auction
    ]
    actuals = [("2026-01-10T12:00:00Z", 150), ("2026-01-10T12:30:00Z", 250)]
    return build_dataset(forecasts, actuals)


def test_hourly_actual_is_mean_of_half_hours(ds):
    assert ds.actuals_hourly[utc("2026-01-10T12:00:00")] == 200


def test_decision_uses_latest_forecast_before_cutoff(ds):
    rows = analysis.decision_series(ds, date(2026, 1, 10), time(9, 20))
    noon = next(r for r in rows if r["start"] == utc("2026-01-10T12:00:00"))
    assert noon["forecast"] == 200 and noon["publish_time"] == utc("2026-01-09T07:30:00")


def test_later_cutoff_picks_newer_forecast(ds):
    rows = analysis.decision_series(ds, date(2026, 1, 10), time(9, 45))
    noon = next(r for r in rows if r["start"] == utc("2026-01-10T12:00:00"))
    assert noon["forecast"] == 300


def test_hours_without_forecast_are_none(ds):
    rows = analysis.decision_series(ds, date(2026, 1, 10))
    assert rows[0]["forecast"] is None and len(rows) == 24


def test_metrics_sign_and_values():
    m = analysis.metrics([(110, 100), (90, 100), (130, 100)])
    assert m["mae"] == pytest.approx(50 / 3)
    assert m["bias"] == pytest.approx(10)  # positive = over-forecast
    assert m["rmse"] == pytest.approx(((100 + 100 + 900) / 3) ** 0.5)


def test_dst_day_has_23_hours():
    assert len(analysis.delivery_hours(date(2026, 3, 29))) == 23


def test_band_needs_history(ds):
    assert analysis.uncertainty_band(ds, date(2026, 1, 10)) is None


def test_band_never_uses_target_day_or_later():
    # day1 error +10, day2 error +10, day3 (target) error -1000: band for day3 must ignore day3.
    fc, ac = [], []
    for day, f, a in [(2, 110, 100), (3, 110, 100), (4, 0, 1000)]:
        fc.append((f"2026-01-{day-1:02d}T07:30:00Z", f"2026-01-{day:02d}T12:00:00Z", f))
        ac += [(f"2026-01-{day:02d}T12:00:00Z", a), (f"2026-01-{day:02d}T12:30:00Z", a)]
    band = analysis.uncertainty_band(build_dataset(fc, ac), date(2026, 1, 4))
    assert band["p10"] == pytest.approx(10) and band["p90"] == pytest.approx(10)


def test_api_smoke():
    c = TestClient(app)
    r = c.get("/api/decision", params={"delivery_date": "2026-01-15"}).json()
    assert len(r["hours"]) == 24 and r["forecast_published"] == ["2026-01-14T07:30:00Z"]
    assert c.get("/api/accuracy").json()["overall"]["n"] > 700
    assert c.get("/api/decision", params={"delivery_date": "2026-03-01"}).status_code == 422
    assert c.get("/api/decision", params={"delivery_date": "2026-01-15", "cutoff": "x"}).status_code == 422
