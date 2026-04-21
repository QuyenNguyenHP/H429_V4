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
PMS_ADDR_MAP = {
    "DG#1": {
        "current": "40011",
        "voltage": "40019",
        "power_kw": "40029",
        "frequency": "40033",
    },
    "DG#2": {
        "current": "40045",
        "voltage": "40053",
        "power_kw": "40063",
        "frequency": "40067",
    },
    "DG#3": {
        "current": "40079",
        "voltage": "40087",
        "power_kw": "40097",
        "frequency": "40101",
    },
}
GRAPH_PRESETS = {
    "load": ("LOAD",),
    "pms": ("POWER_KW",),
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


def _resolve_pms_snapshot_timestamp(db: Session, target_db: str | None = None) -> str | None:
    if target_db is None:
        stmt = text(
            """
            SELECT timestamp
            FROM Stored_database
            WHERE dg_name = 'PMS'
              AND timestamp IS NOT NULL
            ORDER BY timestamp DESC
            LIMIT 1
            """
        )
        return db.execute(stmt).scalar_one_or_none()

    at_or_before_stmt = text(
        """
        SELECT timestamp
        FROM Stored_database
        WHERE dg_name = 'PMS'
          AND timestamp IS NOT NULL
          AND timestamp <= :target_ts
        ORDER BY timestamp DESC
        LIMIT 1
        """
    )
    resolved = db.execute(at_or_before_stmt, {"target_ts": target_db}).scalar_one_or_none()
    if resolved:
        return resolved

    after_stmt = text(
        """
        SELECT timestamp
        FROM Stored_database
        WHERE dg_name = 'PMS'
          AND timestamp IS NOT NULL
          AND timestamp >= :target_ts
        ORDER BY timestamp ASC
        LIMIT 1
        """
    )
    return db.execute(after_stmt, {"target_ts": target_db}).scalar_one_or_none()


def _fetch_latest_pms_rows_by_addr(
    db: Session,
    addr_values: list[str],
    target_db: str | None,
):
    addr_placeholders = ", ".join(f":addr_{index}" for index, _ in enumerate(addr_values))
    params: dict[str, object] = {}
    for index, addr in enumerate(addr_values):
        params[f"addr_{index}"] = addr

    if target_db is None:
        stmt = text(
            f"""
            WITH ranked AS (
                SELECT
                    addr,
                    val,
                    unit,
                    timestamp,
                    ROW_NUMBER() OVER (
                        PARTITION BY addr
                        ORDER BY datetime(timestamp) DESC
                    ) AS rn
                FROM Stored_database
                WHERE dg_name = 'PMS'
                  AND addr IN ({addr_placeholders})
                  AND datetime(timestamp) IS NOT NULL
            )
            SELECT addr, val, unit, timestamp
            FROM ranked
            WHERE rn = 1
            """
        )
        return db.execute(stmt, params).mappings().all()

    params["target_ts"] = target_db
    stmt = text(
        f"""
        WITH ranked_before AS (
            SELECT
                addr,
                val,
                unit,
                timestamp,
                ROW_NUMBER() OVER (
                    PARTITION BY addr
                    ORDER BY datetime(timestamp) DESC
                ) AS rn
            FROM Stored_database
            WHERE dg_name = 'PMS'
              AND addr IN ({addr_placeholders})
              AND datetime(timestamp) IS NOT NULL
              AND datetime(timestamp) <= datetime(:target_ts)
        ),
        ranked_after AS (
            SELECT
                addr,
                val,
                unit,
                timestamp,
                ROW_NUMBER() OVER (
                    PARTITION BY addr
                    ORDER BY datetime(timestamp) ASC
                ) AS rn
            FROM Stored_database
            WHERE dg_name = 'PMS'
              AND addr IN ({addr_placeholders})
              AND datetime(timestamp) IS NOT NULL
              AND datetime(timestamp) >= datetime(:target_ts)
        )
        SELECT addr, val, unit, timestamp
        FROM ranked_before
        WHERE rn = 1
        UNION ALL
        SELECT a.addr, a.val, a.unit, a.timestamp
        FROM ranked_after AS a
        WHERE a.rn = 1
          AND NOT EXISTS (
              SELECT 1
              FROM ranked_before AS b
              WHERE b.addr = a.addr
                AND b.rn = 1
          )
        """
    )
    return db.execute(stmt, params).mappings().all()


@router.get("/pms")
def get_pms_snapshot(
    timestamp: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
):
    target_db = None
    requested_iso = None
    if timestamp is not None:
        target_dt, target_db = _normalize_utc_timestamp(timestamp)
        requested_iso = target_dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

    addr_values = []
    for field_map in PMS_ADDR_MAP.values():
        for addr in field_map.values():
            if addr not in addr_values:
                addr_values.append(addr)

    rows = _fetch_latest_pms_rows_by_addr(db, addr_values, target_db)
    if not rows:
        raise HTTPException(status_code=404, detail="No PMS snapshot found")

    row_by_addr = {str(row["addr"]): row for row in rows}

    machines = []
    snapshot_candidates = []
    for dg_name in ALLOWED_DG_NAMES:
        mapping = PMS_ADDR_MAP[dg_name]
        metrics = {}
        for metric_name, addr in mapping.items():
            row = row_by_addr.get(addr)
            if row and row.get("timestamp") is not None:
                snapshot_candidates.append(str(row["timestamp"]))
            raw_value = row["val"] if row else None
            if metric_name == "frequency" and raw_value is not None:
                try:
                    raw_value = round(float(raw_value), 2)
                except (TypeError, ValueError):
                    pass
            metrics[metric_name] = {
                "addr": addr,
                "value": raw_value,
                "unit": row["unit"] if row and row["unit"] else (
                    "kW" if metric_name == "power_kw"
                    else "A" if metric_name == "current"
                    else "V" if metric_name == "voltage"
                    else "Hz"
                ),
            }
        machines.append(
            {
                "dg_name": dg_name,
                "power_kw": metrics["power_kw"],
                "current": metrics["current"],
                "voltage": metrics["voltage"],
                "frequency": metrics["frequency"],
            }
        )

    resolved_timestamp = max(snapshot_candidates) if snapshot_candidates else _resolve_pms_snapshot_timestamp(db, target_db)
    if resolved_timestamp is None:
        raise HTTPException(status_code=404, detail="No PMS snapshot found")
    snapshot_iso = datetime.fromisoformat(str(resolved_timestamp)).replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "requested_timestamp": requested_iso,
        "snapshot_timestamp": snapshot_iso,
        "machines": machines,
    }


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

    if normalized_graph_type in {"load", "load_detail", "running_hour", "pms"}:
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

    range_seconds = max(1, int((to_dt - from_dt).total_seconds()))
    bucket_seconds = max(1, math.ceil(range_seconds / max_points))
    rows = []
    if normalized_graph_type == "pms":
        addr_placeholders = ", ".join(f":addr_{index}" for index, _ in enumerate(normalized_names))
        params = {
            "from_ts": from_db,
            "to_ts": to_db,
            "from_epoch": int(from_dt.replace(tzinfo=timezone.utc).timestamp()),
            "bucket_seconds": bucket_seconds,
        }
        dg_name_by_addr = {}
        for index, dg_name_item in enumerate(normalized_names):
            addr = PMS_ADDR_MAP[dg_name_item]["power_kw"]
            params[f"addr_{index}"] = addr
            dg_name_by_addr[addr] = dg_name_item

        stmt = text(
            f"""
            WITH filtered AS (
                SELECT
                    addr,
                    datetime(timestamp) AS normalized_timestamp,
                    val,
                    unit,
                    CAST(((CAST(strftime('%s', datetime(timestamp)) AS INTEGER) - :from_epoch) / :bucket_seconds) AS INTEGER) AS bucket
                FROM Stored_database
                WHERE dg_name = 'PMS'
                  AND addr IN ({addr_placeholders})
                  AND datetime(timestamp) IS NOT NULL
                  AND datetime(timestamp) >= datetime(:from_ts)
                  AND datetime(timestamp) <= datetime(:to_ts)
            ),
            latest_per_bucket AS (
                SELECT addr, bucket, MAX(normalized_timestamp) AS latest_timestamp
                FROM filtered
                GROUP BY addr, bucket
            )
            SELECT f.addr, f.normalized_timestamp AS timestamp, f.val, f.unit
            FROM filtered AS f
            INNER JOIN latest_per_bucket AS b
                ON b.addr = f.addr
               AND b.bucket = f.bucket
               AND b.latest_timestamp = f.normalized_timestamp
            ORDER BY f.normalized_timestamp ASC, f.addr ASC
            """
        )
        raw_rows = db.execute(stmt, params).mappings().all()
        rows = [
            {
                "dg_name": dg_name_by_addr.get(str(row["addr"]), ""),
                "label": "POWER_KW",
                "timestamp": row["timestamp"],
                "val": row["val"],
                "unit": row["unit"] or "kW",
            }
            for row in raw_rows
            if dg_name_by_addr.get(str(row["addr"]))
        ]
    else:
        placeholders = ", ".join(f":dg_{index}" for index, _ in enumerate(normalized_names))
        label_placeholders = ", ".join(f":label_{index}" for index, _ in enumerate(target_labels))
        params = {
            "from_ts": from_db,
            "to_ts": to_db,
            "from_epoch": int(from_dt.replace(tzinfo=timezone.utc).timestamp()),
            "bucket_seconds": bucket_seconds,
        }
        for index, dg_name_item in enumerate(normalized_names):
            params[f"dg_{index}"] = dg_name_item
        for index, label in enumerate(target_labels):
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
                    else "kW"
                    if label == "POWER_KW"
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
