from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import Check_all_status_lable, engine_graph
from app.config import APP_NAME, APP_VERSION, CORS_ORIGINS
from app.db import engine, ensure_sqlite_indexes
from app.models import Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_indexes()
    yield


app = FastAPI(title=APP_NAME, version=APP_VERSION, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(Check_all_status_lable.router)
app.include_router(engine_graph.router)


@app.get("/")
def root():
    return {"name": APP_NAME, "version": APP_VERSION, "status": "running"}
