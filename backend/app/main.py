from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, baselines, chat, debriefs, metrics, onboarding, sources, surveys, users
from app.services.scheduler import start_scheduler, stop_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown events."""
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="VitalView API", version="0.2.0", lifespan=lifespan)

# CORS — required for mobile app direct calls to FastAPI.
# iOS apps don't send an Origin header so this is effectively a no-op for
# the mobile client, but harmless and needed if a web client is also served.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
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
