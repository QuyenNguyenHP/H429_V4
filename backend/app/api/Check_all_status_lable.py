from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import LiveEngineData
from app.services.live_service import get_latest_all

router = APIRouter(prefix="/api/check_all_status_lable", tags=["check_all_status_lable"])

TARGET_MACHINES = {"DG#1", "DG#2", "DG#3", "ME-PORT", "ME-STBD"}
ME_MACHINES = {"ME-PORT", "ME-STBD"}

PMS_ADDR_MAP = {
    "DG#1": {
        "current": "40011",
        "voltage": "40019",
        "power_kw": "40029",
        "power_factor": "40031",
        "frequency": "40033",
    },
    "DG#2": {
        "current": "40045",
        "voltage": "40053",
        "power_kw": "40063",
        "power_factor": "40065",
        "frequency": "40067",
    },
    "DG#3": {
        "current": "40079",
        "voltage": "40087",
        "power_kw": "40097",
        "power_factor": "40099",
        "frequency": "40101",
    },
}

ANALOG_THRESHOLD_PROFILE = {
    "LUB OIL TEMPERATURE ENGINE INLET": {
        "normal": {"lt": 60},
        "warning": {"gte": 60, "lt": 65},
        "critical": {"gte": 65},
    },
    "H.T. WATER TEMPERATURE ENGINE OUTLET": {
        "normal": {"lt": 80},
        "warning": {"gte": 80, "lt": 90},
        "critical": {"gte": 90},
    },
    "NO.1CYL. EXHAUST GAS TEMPERATURE": {
        "normal": {"lt": 400},
        "warning": {"gte": 400, "lt": 480},
        "critical": {"gte": 480},
    },
    "NO.2CYL. EXHAUST GAS TEMPERATURE": {
        "normal": {"lt": 400},
        "warning": {"gte": 400, "lt": 480},
        "critical": {"gte": 480},
    },
    "EXHAUST GAS TEMPERATURE T/C INLET 1": {
        "normal": {"lt": 480},
        "warning": {"gte": 480, "lt": 580},
        "critical": {"gte": 580},
    },
    "EXHAUST GAS TEMPERATURE T/C INLET 2": {
        "normal": {"lt": 480},
        "warning": {"gte": 480, "lt": 580},
        "critical": {"gte": 580},
    },
    "H.T. WATER PRESSURE ENGINE INLET": {},
    "L.T. WATER PRESSURE ENGINE INLET": {},
    "STARTING AIR PRESSURE": {
        "normal": {"gt": 2.0},
        "warning": {"gt": 1.5, "lte": 2.0},
        "critical": {"lte": 1.5},
    },
    "FUEL OIL PRESSURE ENGINE INLET": {
        "normal": {"gt": 0.35},
        "warning": {"gt": 0.3, "lte": 0.35},
        "critical": {"lte": 0.3},
    },
    "LUB OIL PRESSURE": {
        "normal": {"gt": 0.35},
        "warning": {"gt": 0.3, "lte": 0.35},
        "critical": {"lte": 0.3},
    },
    "ENGINE SPEED": {
        "normal": {"lt": 900},
        "warning": {"gte": 900, "lt": 1020},
        "critical": {"gte": 1020},
    },
    "LOAD": {},
    "RUNNING HOUR": {},
}

RUN_REQUIRED_LABELS = {"FUEL OIL PRESSURE ENGINE INLET", "LUB OIL PRESSURE"}

DIGITAL_SPECIAL_VALUE_STATUS = {
    "ENGINE RUN": ("Stop", "Running"),
    "READY TO START": ("Not Ready", "Ready"),
    "PRIMING PUMP RUN": ("Stop", "Running"),
    "NO.1 ALARM REPOSE SIGNAL(#14)": ("OFF", "Repose"),
    "NO.2 ALARM REPOSE SIGNAL(#14T)": ("OFF", "Repose"),
    "NO.3 ALARM REPOSE SIGNAL(EXH. GAS)": ("OFF", "Repose"),
    "NO.4 ALARM REPOSE SIGNAL(PRIMING)": ("OFF", "Repose"),
    "NO.5 ALARM REPOSE SIGNAL(STARTING)": ("OFF", "Repose"),
    "NO.6 ALARM REPOSE SIGNAL(FILTER DIFF. PRESS.)": ("OFF", "Repose"),
}

DIGITAL_ALARM_WITH_REPOSE = {
    "LUB OIL FILTER DIFFERENTIAL PRESSURE HIGH": "NO.6 ALARM REPOSE SIGNAL(FILTER DIFF. PRESS.)",
    "FUEL OIL PRESSURE LOW": "NO.2 ALARM REPOSE SIGNAL(#14T)",
    "LUB OIL PRESSURE LOW": "NO.2 ALARM REPOSE SIGNAL(#14T)",
    "H.T. WATER PRESSURE LOW": "NO.2 ALARM REPOSE SIGNAL(#14T)",
    "L.T. WATER PRESSURE LOW": "NO.2 ALARM REPOSE SIGNAL(#14T)",
    "H.T. WATER TEMPERATURE HIGH": "NO.1 ALARM REPOSE SIGNAL(#14)",
    "T/C LUB OIL PRESSURE LOW": "NO.2 ALARM REPOSE SIGNAL(#14T)",
    "H.T. WATER TEMPERATURE HIGH (STOP)": "NO.1 ALARM REPOSE SIGNAL(#14)",
    "LUB OIL PRESSURE LOW (STOP)": "NO.2 ALARM REPOSE SIGNAL(#14T)",
    "PRIMING LUB OIL PRESSURE LOW": "NO.4 ALARM REPOSE SIGNAL(PRIMING)",
}


def _norm_label(label: str | None) -> str:
    return str(label or "").strip().upper()


def _normalize_dg_name(value: str | None) -> str | None:
    if value is None:
        return None
    raw = str(value).strip().upper().replace(" ", "").replace("_", "-")
    if raw in {"DG1", "DG#1", "DG-1"}:
        return "DG#1"
    if raw in {"DG2", "DG#2", "DG-2"}:
        return "DG#2"
    if raw in {"DG3", "DG#3", "DG-3"}:
        return "DG#3"
    if raw == "ME-PORT":
        return "ME-PORT"
    if raw == "ME-STBD":
        return "ME-STBD"
    return None


def _normalize_utc_timestamp(value: datetime) -> tuple[datetime, str]:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value, value.isoformat()


def _serialize_row(row) -> dict:
    if isinstance(row, dict):
        return {
            "addr": row.get("addr"),
            "label": row.get("label"),
            "value": row.get("value", row.get("val")),
            "unit": row.get("unit"),
            "timestamp": row.get("timestamp"),
            "dg_name": row.get("dg_name"),
        }

    return {
        "addr": getattr(row, "addr", None),
        "label": getattr(row, "label", None),
        "value": getattr(row, "value", getattr(row, "val", None)),
        "unit": getattr(row, "unit", None),
        "timestamp": getattr(row, "timestamp", None),
        "dg_name": getattr(row, "dg_name", None),
    }


def _to_float(value) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _fetch_pms_point_db(db: Session, addr: str) -> dict | None:
    stmt = (
        select(LiveEngineData)
        .where(LiveEngineData.dg_name == "PMS", LiveEngineData.addr == addr)
        .order_by(LiveEngineData.timestamp.desc())
        .limit(1)
    )
    row = db.execute(stmt).scalar_one_or_none()
    if row is None:
        return None
    return {
        "addr": row.addr,
        "value": row.val,
        "unit": row.unit,
        "timestamp": row.timestamp,
    }


def _fetch_pms_point_snapshot_db(db: Session, addr: str, snapshot_ts: str) -> dict | None:
    stmt = text(
        """
        SELECT
            addr,
            val AS value,
            unit,
            timestamp
        FROM Stored_database
        WHERE dg_name = 'PMS'
          AND addr = :addr
          AND timestamp = :snapshot_ts
        LIMIT 1
        """
    )
    row = db.execute(stmt, {"addr": addr, "snapshot_ts": snapshot_ts}).mappings().one_or_none()
    if row is None:
        return None
    return {
        "addr": row["addr"],
        "value": row["value"],
        "unit": row["unit"],
        "timestamp": row["timestamp"],
    }


def _fetch_stored_rows_by_timestamp(db: Session, dg_name: str, snapshot_ts: str):
    rows_stmt = text(
        """
        SELECT
            dg_name,
            addr,
            label,
            val AS value,
            unit,
            timestamp
        FROM Stored_database
        WHERE dg_name = :dg_name
          AND timestamp = :snapshot_ts
        ORDER BY CAST(addr AS INTEGER)
        """
    )
    return db.execute(
        rows_stmt,
        {"dg_name": dg_name, "snapshot_ts": snapshot_ts},
    ).mappings().all()


def _resolve_pms_snapshot_timestamp(
    db: Session,
    target_snapshot_ts: str,
    max_lag_seconds: int = 1,
) -> str | None:
    candidate_stmt = text(
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
    candidate = db.execute(candidate_stmt, {"target_ts": target_snapshot_ts}).scalar_one_or_none()
    if candidate is None:
        return None

    try:
        target_dt = datetime.fromisoformat(str(target_snapshot_ts).replace("Z", "+00:00")).astimezone(timezone.utc)
        candidate_dt = datetime.fromisoformat(str(candidate).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None

    if candidate_dt < target_dt - timedelta(seconds=max_lag_seconds):
        return None
    return str(candidate)


def _is_running_for_machine(dg_name: str, digital_by_label: dict[str, dict], analog_rows: list[dict]) -> bool:
    if dg_name in ME_MACHINES:
        me_rev_point = next((r for r in analog_rows if _norm_label(r.get("label")) == "M/E REVOLUTION"), None)
        me_rev_value = _to_float(me_rev_point.get("value")) if me_rev_point else None
        return (me_rev_value or 0) > 0
    engine_run_row = digital_by_label.get("ENGINE RUN")
    return _is_on(engine_run_row.get("value")) if engine_run_row else False


def _is_on(value) -> bool:
    if isinstance(value, (int, float)):
        return float(value) == 1.0
    normalized = str(value or "").strip().lower()
    return normalized in {"1", "on", "true", "yes"}


def _condition_match(value: float | None, cond: dict | None) -> bool:
    if value is None or not cond:
        return False
    if "gt" in cond and not (value > cond["gt"]):
        return False
    if "gte" in cond and not (value >= cond["gte"]):
        return False
    if "lt" in cond and not (value < cond["lt"]):
        return False
    if "lte" in cond and not (value <= cond["lte"]):
        return False
    return True


def _analog_status(label: str, value: float | None, is_running: bool) -> str:
    rule = ANALOG_THRESHOLD_PROFILE.get(label)
    if rule is None:
        return "Normal"
    if not rule:
        return "Normal"
    if label in RUN_REQUIRED_LABELS and not is_running:
        return "Normal"
    if _condition_match(value, rule.get("critical")):
        return "Critical"
    if _condition_match(value, rule.get("warning")):
        return "Warning"
    if _condition_match(value, rule.get("normal")):
        return "Normal"
    return "Normal"


def _digital_status(
    label: str,
    value,
    repose_by_label: dict[str, bool],
) -> str:
    if label in DIGITAL_SPECIAL_VALUE_STATUS:
        off_text, on_text = DIGITAL_SPECIAL_VALUE_STATUS[label]
        return on_text if _is_on(value) else off_text

    repose_label = DIGITAL_ALARM_WITH_REPOSE.get(label)
    if repose_label:
        repose_on = repose_by_label.get(repose_label, False)
        return "Alarm" if _is_on(value) and not repose_on else "Normal"
    return "Alarm" if _is_on(value) else "Normal"


def _build_machine_payload(
    dg_name: str,
    rows: list[dict],
    db: Session,
    include_pms: bool = True,
    pms_snapshot_ts: str | None = None,
) -> dict:
    digital_rows = [r for r in rows if str(r.get("unit") or "").strip().lower() == "on/off"]
    analog_rows = [r for r in rows if str(r.get("unit") or "").strip().lower() != "on/off"]

    digital_by_label = {_norm_label(r.get("label")): r for r in digital_rows}
    repose_by_label = {
        key: _is_on(digital_by_label.get(key).get("value")) if digital_by_label.get(key) else False
        for key in {
            "NO.1 ALARM REPOSE SIGNAL(#14)",
            "NO.2 ALARM REPOSE SIGNAL(#14T)",
            "NO.3 ALARM REPOSE SIGNAL(EXH. GAS)",
            "NO.4 ALARM REPOSE SIGNAL(PRIMING)",
            "NO.5 ALARM REPOSE SIGNAL(STARTING)",
            "NO.6 ALARM REPOSE SIGNAL(FILTER DIFF. PRESS.)",
        }
    }
    is_running = _is_running_for_machine(dg_name, digital_by_label, analog_rows)

    analog_result = []
    for row in analog_rows:
        label = _norm_label(row.get("label"))
        analog_result.append(
            {
                "addr": row.get("addr"),
                "label": row.get("label"),
                "value": row.get("value"),
                "unit": row.get("unit"),
                "timestamp": row.get("timestamp"),
                "status": _analog_status(label, _to_float(row.get("value")), is_running),
            }
        )

    digital_result = []
    for row in digital_rows:
        label = _norm_label(row.get("label"))
        digital_result.append(
            {
                "addr": row.get("addr"),
                "label": row.get("label"),
                "value": row.get("value"),
                "unit": row.get("unit"),
                "timestamp": row.get("timestamp"),
                "status": _digital_status(label, row.get("value"), repose_by_label),
            }
        )

    return {
        "dg_name": dg_name,
        "analog": analog_result,
        "digital": digital_result,
        "pms": {
            field: (
                _fetch_pms_point_snapshot_db(db, addr, pms_snapshot_ts)
                if pms_snapshot_ts
                else _fetch_pms_point_db(db, addr)
            )
            for field, addr in PMS_ADDR_MAP.get(dg_name, {}).items()
        } if include_pms else {},
    }


def _resolve_stored_snapshot_timestamp(
    db: Session,
    dg_name: str,
    target_db: str | None = None,
) -> str | None:
    if target_db is None:
        latest_stmt = text(
            """
            SELECT timestamp AS snapshot_ts
            FROM Stored_database
            WHERE dg_name = :dg_name
              AND timestamp IS NOT NULL
            ORDER BY timestamp DESC
            LIMIT 1
            """
        )
        return db.execute(latest_stmt, {"dg_name": dg_name}).scalar_one_or_none()

    at_or_before_stmt = text(
        """
        SELECT timestamp AS snapshot_ts
        FROM Stored_database
        WHERE dg_name = :dg_name
          AND timestamp IS NOT NULL
          AND timestamp <= :target_ts
        ORDER BY timestamp DESC
        LIMIT 1
        """
    )
    resolved = db.execute(
        at_or_before_stmt,
        {"dg_name": dg_name, "target_ts": target_db},
    ).scalar_one_or_none()
    if resolved:
        return resolved

    after_stmt = text(
        """
        SELECT timestamp AS snapshot_ts
        FROM Stored_database
        WHERE dg_name = :dg_name
          AND timestamp IS NOT NULL
          AND timestamp >= :target_ts
        ORDER BY timestamp ASC
        LIMIT 1
        """
    )
    return db.execute(
        after_stmt,
        {"dg_name": dg_name, "target_ts": target_db},
    ).scalar_one_or_none()


@router.get("/all")
def check_all_status_lable(db: Session = Depends(get_db)):
    rows = [_serialize_row(r) for r in get_latest_all(db)]

    machine_rows: dict[str, list] = {name: [] for name in TARGET_MACHINES}
    for row in rows:
        dg_name = _normalize_dg_name(row.get("dg_name"))
        if dg_name not in TARGET_MACHINES:
            continue
        machine_rows[dg_name].append(row)

    return [
        _build_machine_payload(dg_name, machine_rows[dg_name], db)
        for dg_name in sorted(machine_rows.keys())
    ]


@router.get("/index")
def get_index_status(db: Session = Depends(get_db)):
    payload = []

    for dg_name in sorted(TARGET_MACHINES):
        resolved_timestamp = _resolve_stored_snapshot_timestamp(db, dg_name)
        if resolved_timestamp is None:
            payload.append(
                {
                    "dg_name": dg_name,
                    "analog": [],
                    "digital": [],
                    "pms": {},
                    "snapshot_timestamp": None,
                    "pms_snapshot_timestamp": None,
                }
            )
            continue

        rows = _fetch_stored_rows_by_timestamp(db, dg_name, str(resolved_timestamp))
        if not rows:
            payload.append(
                {
                    "dg_name": dg_name,
                    "analog": [],
                    "digital": [],
                    "pms": {},
                    "snapshot_timestamp": str(resolved_timestamp),
                    "pms_snapshot_timestamp": None,
                }
            )
            continue

        pms_snapshot_ts = _resolve_pms_snapshot_timestamp(db, str(resolved_timestamp))
        machine_payload = _build_machine_payload(
            dg_name,
            [_serialize_row(dict(row)) for row in rows],
            db,
            include_pms=True,
            pms_snapshot_ts=pms_snapshot_ts,
        )
        payload.append(
            {
                **machine_payload,
                "snapshot_timestamp": str(resolved_timestamp),
                "pms_snapshot_timestamp": pms_snapshot_ts,
            }
        )

    return payload


@router.get("/snapshot")
def get_snapshot_by_timestamp(
    dg_name: str = Query(...),
    timestamp: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
):
    normalized_dg_name = _normalize_dg_name(dg_name)
    if normalized_dg_name not in TARGET_MACHINES:
        raise HTTPException(status_code=400, detail=f"Unsupported dg_name: {dg_name}")

    target_dt = None
    target_db = None
    if timestamp is not None:
        target_dt, target_db = _normalize_utc_timestamp(timestamp)

    resolved_timestamp = _resolve_stored_snapshot_timestamp(db, normalized_dg_name, target_db)
    if resolved_timestamp is None:
        raise HTTPException(status_code=404, detail=f"No stored snapshot found for {normalized_dg_name}")

    rows = _fetch_stored_rows_by_timestamp(db, normalized_dg_name, str(resolved_timestamp))
    if not rows:
        raise HTTPException(status_code=404, detail=f"No stored snapshot rows found for {normalized_dg_name}")

    pms_snapshot_ts = _resolve_pms_snapshot_timestamp(db, str(resolved_timestamp))
    machine_payload = _build_machine_payload(
        normalized_dg_name,
        [_serialize_row(dict(row)) for row in rows],
        db,
        include_pms=True,
        pms_snapshot_ts=pms_snapshot_ts,
    )
    snapshot_dt = datetime.fromisoformat(str(resolved_timestamp).replace("Z", "+00:00")).astimezone(timezone.utc)
    requested_iso = (
        target_dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        if target_dt is not None
        else None
    )

    return {
        **machine_payload,
        "requested_timestamp": requested_iso,
        "snapshot_timestamp": snapshot_dt.isoformat().replace("+00:00", "Z"),
        "pms_snapshot_timestamp": pms_snapshot_ts,
    }
