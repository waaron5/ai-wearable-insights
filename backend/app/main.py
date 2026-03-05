from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.routers import baselines, chat, debriefs, metrics, onboarding, sources, surveys, users
from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown events."""
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="VitalView API", version="0.1.0", lifespan=lifespan)

app.include_router(users.router)
app.include_router(metrics.router)
app.include_router(sources.router)
app.include_router(baselines.router)
app.include_router(onboarding.router)
app.include_router(debriefs.router)
app.include_router(chat.router)
app.include_router(surveys.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
