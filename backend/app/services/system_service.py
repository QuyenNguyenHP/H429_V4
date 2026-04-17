from datetime import datetime, timezone
from pathlib import Path
import shutil

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import APP_NAME, APP_VERSION, DB_PATH
from app.models import LiveEngineData
from app.schemas import SystemHealthResponse, SystemStatusResponse


def _cpu_temp_c() -> float | None:
    thermal_file = Path("/sys/class/thermal/thermal_zone0/temp")
    if thermal_file.exists():
        try:
            raw = thermal_file.read_text(encoding="ascii").strip()
            return round(int(raw) / 1000.0, 2)
        except Exception:
            return None
    return None


def get_last_update_time(db: Session):
    return db.execute(select(func.max(LiveEngineData.timestamp))).scalar_one_or_none()


def get_health(db: Session) -> SystemHealthResponse:
    return SystemHealthResponse(
        status="ok",
        db_path=str(DB_PATH),
        db_exists=DB_PATH.exists(),
        last_update_time=get_last_update_time(db),
    )


def get_status(db: Session) -> SystemStatusResponse:
    usage = shutil.disk_usage(Path(__file__).resolve().anchor)
    return SystemStatusResponse(
        app_name=APP_NAME,
        version=APP_VERSION,
        disk_total_gb=round(usage.total / (1024**3), 2),
        disk_used_gb=round(usage.used / (1024**3), 2),
        disk_free_gb=round(usage.free / (1024**3), 2),
        cpu_temp_c=_cpu_temp_c(),
        utc_time=datetime.now(timezone.utc),
        last_update_time=get_last_update_time(db),
    )
