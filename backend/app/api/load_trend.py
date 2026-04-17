import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db

router = APIRouter(prefix="/api/load_trend", tags=["load_trend"])

ALLOWED_DG_NAMES = ("DG#1", "DG#2", "DG#3")
DEFAULT_MAX_POINTS = 720
MAX_MAX_POINTS = 5000
LABEL_PRESETS = {
    "load_detail": (
        "LOAD",
        "LUB OIL PRESSURE",
        "FUEL OIL PRESSURE ENGINE INLET",
    ),
    "tc_exh": (
        "EXHAUST GAS TEMPERATURE T/C OUTLET",
        "EXHAUST GAS TEMPERATURE T/C INLET 1",
        "EXHAUST GAS TEMPERATURE T/C INLET 2",
    ),
}


def _normalize_dg_name(value: str) -> str | None:
    raw = str(value or "").strip().upper().replace(" ", "").replace("_", "-")
    if raw in {"DG1", "DG#1", "DG-1"}:
        return "DG#1"
    if raw in {"DG2", "DG#2", "DG-2"}:
        return "DG#2"
    if raw in {"DG3", "DG#3", "DG-3"}:
        return "DG#3"
    return None


def _normalize_utc_timestamp(value: datetime) -> tuple[datetime, str]:
    if value.tzinfo is not None:
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    return value, value.strftime("%Y-%m-%d %H:%M:%S")


@router.get("")
def get_load_trend(
    from_ts: datetime = Query(..., alias="from"),
    to_ts: datetime = Query(..., alias="to"),
    dg_names: list[str] | None = Query(default=None),
    label_preset: str | None = Query(default=None),
    max_points: int = Query(default=DEFAULT_MAX_POINTS, ge=60, le=MAX_MAX_POINTS),
    db: Session = Depends(get_db),
):
    if from_ts >= to_ts:
        raise HTTPException(status_code=400, detail="'from' must be earlier than 'to'")

    from_dt, from_db = _normalize_utc_timestamp(from_ts)
    to_dt, to_db = _normalize_utc_timestamp(to_ts)

    if dg_names:
        normalized_names = []
        for item in dg_names:
            normalized = _normalize_dg_name(item)
            if normalized is None:
                raise HTTPException(status_code=400, detail=f"Unsupported dg_name: {item}")
            if normalized not in normalized_names:
                normalized_names.append(normalized)
    else:
        normalized_names = list(ALLOWED_DG_NAMES)

    placeholders = ", ".join(f":dg_{index}" for index, _ in enumerate(normalized_names))
    normalized_preset = str(label_preset or "").strip().lower() or None
    if normalized_preset is not None and normalized_preset not in LABEL_PRESETS:
        raise HTTPException(status_code=400, detail=f"Unsupported label_preset: {label_preset}")

    target_labels = LABEL_PRESETS.get(normalized_preset, ("LOAD",))
    params = {
        "from_ts": from_db,
        "to_ts": to_db,
    }
    for index, dg_name in enumerate(normalized_names):
        params[f"dg_{index}"] = dg_name
    label_placeholders = ", ".join(f":label_{index}" for index, _ in enumerate(target_labels))
    for index, label in enumerate(target_labels):
        params[f"label_{index}"] = label

    range_seconds = max(1, int((to_dt - from_dt).total_seconds()))
    bucket_seconds = max(1, math.ceil(range_seconds / max_points))
    params["from_epoch"] = int(from_dt.replace(tzinfo=timezone.utc).timestamp())
    params["bucket_seconds"] = bucket_seconds

    stmt = text(
        f"""
        WITH filtered AS (
            SELECT
                dg_name,
                label,
                datetime(timestamp) AS normalized_timestamp,
                val,
                unit,
                CAST(((CAST(strftime('%s', datetime(timestamp)) AS INTEGER) - :from_epoch) / :bucket_seconds) AS INTEGER) AS bucket
            FROM Stored_database
            WHERE label IN ({label_placeholders})
              AND dg_name IN ({placeholders})
              AND datetime(timestamp) IS NOT NULL
              AND datetime(timestamp) >= datetime(:from_ts)
              AND datetime(timestamp) <= datetime(:to_ts)
        ),
        latest_per_bucket AS (
            SELECT dg_name, label, bucket, MAX(normalized_timestamp) AS latest_timestamp
            FROM filtered
            GROUP BY dg_name, label, bucket
        )
        SELECT f.dg_name, f.label, f.normalized_timestamp AS timestamp, f.val, f.unit
        FROM filtered AS f
        INNER JOIN latest_per_bucket AS b
            ON b.dg_name = f.dg_name
           AND b.label = f.label
           AND b.bucket = f.bucket
           AND b.latest_timestamp = f.normalized_timestamp
        ORDER BY f.normalized_timestamp ASC, f.dg_name ASC, f.label ASC
        """
    )
    rows = db.execute(stmt, params).mappings().all()

    grouped = {}
    for dg_name in normalized_names:
        for label in target_labels:
            series_key = f"{dg_name}::{label}"
            grouped[series_key] = {
                "dg_name": dg_name,
                "label": label,
                "unit": "KwE" if label == "LOAD" else "MPa" if label in {"LUB OIL PRESSURE", "FUEL OIL PRESSURE ENGINE INLET"} else "deg C",
                "points": [],
            }
    for row in rows:
        series_key = f"{row['dg_name']}::{row['label']}"
        grouped[series_key]["points"].append(
            {
                "timestamp": row["timestamp"],
                "value": row["val"],
                "unit": row["unit"] or grouped[series_key]["unit"],
            }
        )
        if row["unit"]:
            grouped[series_key]["unit"] = row["unit"]

    return {
        "label": target_labels[0] if len(target_labels) == 1 else normalized_preset,
        "label_preset": normalized_preset,
        "from": from_dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        "to": to_dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        "bucket_seconds": bucket_seconds,
        "series": [
            grouped[f"{dg_name}::{label}"]
            for dg_name in normalized_names
            for label in target_labels
        ],
    }
