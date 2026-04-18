from datetime import datetime

from pydantic import BaseModel


class LiveValueResponse(BaseModel):
    addr: str
    serial: str | None = None
    label: str | None = None
    dg_name: str | None = None
    value: float | None = None
    unit: str | None = None
    timestamp: datetime
