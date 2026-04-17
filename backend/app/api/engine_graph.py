import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db

router = APIRouter(prefix="/api/engine_graph", tags=["engine_graph"])

ALLOWED_DG_NAMES = ("DG#1", "DG#2", "DG#3")
DEFAULT_MAX_POINTS = 720
MAX_MAX_POINTS = 5000
GRAPH_PRESETS = {
    "load": ("LOAD",),
    "running_hour": ("RUNNING HOUR",),
    "load_detail": (
        "LOAD",
        "LUB OIL PRESSURE",
        "FUEL OIL PRESSURE ENGINE INLET",
    ),
    "cylinder_exh": (
        "No.1CYL. EXHAUST GAS TEMPERATURE",
        "No.2CYL. EXHAUST GAS TEMPERATURE",
        "No.3CYL. EXHAUST GAS TEMPERATURE",
        "No.4CYL. EXHAUST GAS TEMPERATURE",
        "No.5CYL. EXHAUST GAS TEMPERATURE",
        "No.6CYL. EXHAUST GAS TEMPERATURE",
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
def get_engine_graph(
    from_ts: datetime = Query(..., alias="from"),
    to_ts: datetime = Query(..., alias="to"),
    graph_type: str = Query(default="load"),
    dg_names: list[str] | None = Query(default=None),
    dg_name: str | None = Query(default=None),
    max_points: int = Query(default=DEFAULT_MAX_POINTS, ge=60, le=MAX_MAX_POINTS),
    db: Session = Depends(get_db),
):
    if from_ts >= to_ts:
        raise HTTPException(status_code=400, detail="'from' must be earlier than 'to'")

    normalized_graph_type = str(graph_type or "").strip().lower()
    if normalized_graph_type not in GRAPH_PRESETS:
        raise HTTPException(status_code=400, detail=f"Unsupported graph_type: {graph_type}")

    from_dt, from_db = _normalize_utc_timestamp(from_ts)
    to_dt, to_db = _normalize_utc_timestamp(to_ts)
    target_labels = GRAPH_PRESETS[normalized_graph_type]

    if normalized_graph_type in {"load", "load_detail", "running_hour"}:
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
    else:
        normalized_single = _normalize_dg_name(dg_name or "")
        if normalized_single is None:
            raise HTTPException(status_code=400, detail=f"Unsupported dg_name: {dg_name}")
        normalized_names = [normalized_single]

    placeholders = ", ".join(f":dg_{index}" for index, _ in enumerate(normalized_names))
    label_placeholders = ", ".join(f":label_{index}" for index, _ in enumerate(target_labels))
    params = {
        "from_ts": from_db,
        "to_ts": to_db,
    }
    for index, dg_name_item in enumerate(normalized_names):
        params[f"dg_{index}"] = dg_name_item
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
            WHERE dg_name IN ({placeholders})
              AND label IN ({label_placeholders})
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
    for dg_name_item in normalized_names:
        for label in target_labels:
            key = f"{dg_name_item}::{label}"
            grouped[key] = {
                "dg_name": dg_name_item,
                "label": label,
                "unit": (
                    "KwE"
                    if label == "LOAD"
                    else "x10Hours"
                    if label == "RUNNING HOUR"
                    else "MPa"
                    if label in {"LUB OIL PRESSURE", "FUEL OIL PRESSURE ENGINE INLET"}
                    else "deg C"
                ),
                "points": [],
            }

    for row in rows:
        key = f"{row['dg_name']}::{row['label']}"
        grouped[key]["points"].append(
            {
                "timestamp": row["timestamp"],
                "value": row["val"],
                "unit": row["unit"] or grouped[key]["unit"],
            }
        )
        if row["unit"]:
            grouped[key]["unit"] = row["unit"]

    return {
        "graph_type": normalized_graph_type,
        "from": from_dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        "to": to_dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        "bucket_seconds": bucket_seconds,
        "series": [
            grouped[f"{dg_name_item}::{label}"]
            for dg_name_item in normalized_names
            for label in target_labels
        ],
    }
