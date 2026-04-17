from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class LiveEngineData(Base):
    __tablename__ = "live_engine_data"

    imo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    serial: Mapped[str] = mapped_column(Text, primary_key=True)
    dg_name: Mapped[str] = mapped_column(Text, primary_key=True)
    addr: Mapped[str] = mapped_column(Text, primary_key=True)
    label: Mapped[str | None] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    val: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(Text, nullable=True)
