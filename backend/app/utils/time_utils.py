from datetime import datetime


def to_iso_utc(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.isoformat()
