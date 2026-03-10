from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.routers import auth, baselines, chat, debriefs, metrics, onboarding, sources, surveys, sync, users
from app.services.scheduler import start_scheduler, stop_scheduler


# ---------------------------------------------------------------------------
# Rate limiter — keyed by remote address (falls back to IP for mobile)
# ---------------------------------------------------------------------------

limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown events."""
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="VitalView API", version="0.3.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

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

# GZip compression for bandwidth-sensitive mobile clients (min 500 bytes)
app.add_middleware(GZipMiddleware, minimum_size=500)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(metrics.router)
app.include_router(sources.router)
app.include_router(baselines.router)
app.include_router(onboarding.router)
app.include_router(debriefs.router)
app.include_router(chat.router)
app.include_router(surveys.router)
app.include_router(sync.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
