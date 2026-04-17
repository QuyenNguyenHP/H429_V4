from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import SystemHealthResponse, SystemStatusResponse
from app.services.system_service import get_health, get_status

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/health", response_model=SystemHealthResponse)
def health(db: Session = Depends(get_db)):
    return get_health(db)


@router.get("/status", response_model=SystemStatusResponse)
def status(db: Session = Depends(get_db)):
    return get_status(db)
