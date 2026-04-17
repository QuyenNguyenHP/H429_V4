from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LiveValueResponse(BaseModel):
    addr: str
    serial: str | None = None
    label: str | None = None
    dg_name: str | None = None
    value: float | None = None
    unit: str | None = None
    timestamp: datetime


class SystemHealthResponse(BaseModel):
    status: str
    db_path: str
    db_exists: bool
    last_update_time: datetime | None = None


class SystemStatusResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    app_name: str
    version: str
    disk_total_gb: float | None = None
    disk_used_gb: float | None = None
    disk_free_gb: float | None = None
    cpu_temp_c: float | None = None
    utc_time: datetime
    last_update_time: datetime | None = None
