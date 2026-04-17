import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db

router = APIRouter(prefix="/api/cylinder_exh", tags=["cylinder_exh"])

ALLOWED_DG_NAMES = ("DG#1", "DG#2", "DG#3")
DEFAULT_MAX_POINTS = 720
MAX_MAX_POINTS = 5000
CYLINDER_LABELS = (
    "No.1CYL. EXHAUST GAS TEMPERATURE",
    "No.2CYL. EXHAUST GAS TEMPERATURE",
    "No.3CYL. EXHAUST GAS TEMPERATURE",
    "No.4CYL. EXHAUST GAS TEMPERATURE",
    "No.5CYL. EXHAUST GAS TEMPERATURE",
    "No.6CYL. EXHAUST GAS TEMPERATURE",
)


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
def get_cylinder_exh_trend(
    from_ts: datetime = Query(..., alias="from"),
    to_ts: datetime = Query(..., alias="to"),
    dg_name: str = Query(...),
    max_points: int = Query(default=DEFAULT_MAX_POINTS, ge=60, le=MAX_MAX_POINTS),
    db: Session = Depends(get_db),
):
    if from_ts >= to_ts:
        raise HTTPException(status_code=400, detail="'from' must be earlier than 'to'")

    normalized_name = _normalize_dg_name(dg_name)
    if normalized_name is None:
        raise HTTPException(status_code=400, detail=f"Unsupported dg_name: {dg_name}")
    if normalized_name not in ALLOWED_DG_NAMES:
        raise HTTPException(status_code=400, detail=f"Unsupported dg_name: {dg_name}")

    from_dt, from_db = _normalize_utc_timestamp(from_ts)
    to_dt, to_db = _normalize_utc_timestamp(to_ts)
    range_seconds = max(1, int((to_dt - from_dt).total_seconds()))
    bucket_seconds = max(1, math.ceil(range_seconds / max_points))

    label_placeholders = ", ".join(f":label_{index}" for index, _ in enumerate(CYLINDER_LABELS))
    params = {
        "from_ts": from_db,
        "to_ts": to_db,
        "dg_name": normalized_name,
        "from_epoch": int(from_dt.replace(tzinfo=timezone.utc).timestamp()),
        "bucket_seconds": bucket_seconds,
    }
    for index, label in enumerate(CYLINDER_LABELS):
        params[f"label_{index}"] = label

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
            WHERE dg_name = :dg_name
              AND label IN ({label_placeholders})
              AND datetime(timestamp) IS NOT NULL
              AND datetime(timestamp) >= datetime(:from_ts)
              AND datetime(timestamp) <= datetime(:to_ts)
        ),
        latest_per_bucket AS (
            SELECT label, bucket, MAX(normalized_timestamp) AS latest_timestamp
            FROM filtered
            GROUP BY label, bucket
        )
        SELECT f.label, f.normalized_timestamp AS timestamp, f.val, f.unit
        FROM filtered AS f
        INNER JOIN latest_per_bucket AS b
            ON b.label = f.label
           AND b.bucket = f.bucket
           AND b.latest_timestamp = f.normalized_timestamp
        ORDER BY f.normalized_timestamp ASC, f.label ASC
        """
    )
    rows = db.execute(stmt, params).mappings().all()

    grouped = {
        label: {
            "dg_name": normalized_name,
            "label": label,
            "unit": "deg C",
            "points": [],
        }
        for label in CYLINDER_LABELS
    }
    for row in rows:
        grouped[row["label"]]["points"].append(
            {
                "timestamp": row["timestamp"],
                "value": row["val"],
                "unit": row["unit"] or "deg C",
            }
        )
        if row["unit"]:
            grouped[row["label"]]["unit"] = row["unit"]

    return {
        "dg_name": normalized_name,
        "from": from_dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        "to": to_dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        "bucket_seconds": bucket_seconds,
        "series": [grouped[label] for label in CYLINDER_LABELS],
    }
