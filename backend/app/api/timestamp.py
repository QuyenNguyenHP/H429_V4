from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import LiveEngineData

router = APIRouter(prefix="/api/timestamp", tags=["timestamp"])


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
    return str(value).strip()


@router.get("")
def get_latest_timestamp(
    dg_name: str | None = Query(default=None, description="Machine name, e.g. DG#1, ME-PORT"),
    db: Session = Depends(get_db),
):
    normalized_dg = _normalize_dg_name(dg_name)
    stmt = select(func.max(LiveEngineData.timestamp))
    if normalized_dg:
        stmt = stmt.where(LiveEngineData.dg_name == normalized_dg)
    latest_ts = db.execute(stmt).scalar_one_or_none()
    timestamp_iso = latest_ts.isoformat(sep=" ") if latest_ts else None
    date_str = latest_ts.strftime("%Y-%m-%d") if latest_ts else None
    time_str = latest_ts.strftime("%H:%M:%S") if latest_ts else None

    return {
        "dg_name": normalized_dg,
        "timestamp": timestamp_iso,
        "date": date_str,
        "time": time_str,
    }
