from fastapi import FastAPI

from app.routers import baselines, metrics, onboarding, sources, users

app = FastAPI(title="VitalView API", version="0.1.0")

app.include_router(users.router)
app.include_router(metrics.router)
app.include_router(sources.router)
app.include_router(baselines.router)
app.include_router(onboarding.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
