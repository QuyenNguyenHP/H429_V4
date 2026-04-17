from sqlalchemy import case, cast, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.sqltypes import Integer

from app.models import LiveEngineData
from app.schemas import LiveValueResponse


def get_latest_all(db: Session) -> list[LiveValueResponse]:
    # The importer replaces the live snapshot table on each successful refresh.
    dg_order = case(
        (LiveEngineData.dg_name == "DG#1", 1),
        (LiveEngineData.dg_name == "DG#2", 2),
        (LiveEngineData.dg_name == "DG#3", 3),
        (LiveEngineData.dg_name == "ME-PORT", 4),
        (LiveEngineData.dg_name == "ME-STBD", 5),
        else_=99,
    )
    stmt = select(LiveEngineData).order_by(
        dg_order,
        LiveEngineData.serial,
        cast(LiveEngineData.addr, Integer),
    )

    rows = db.execute(stmt).scalars().all()
    return [
        LiveValueResponse(
            addr=r.addr,
            serial=r.serial,
            label=r.label,
            dg_name=r.dg_name,
            value=r.val,
            unit=r.unit,
            timestamp=r.timestamp,
        )
        for r in rows
    ]
