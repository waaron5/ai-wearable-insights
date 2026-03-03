from fastapi import FastAPI

from app.routers import metrics, sources, users

app = FastAPI(title="VitalView API", version="0.1.0")

app.include_router(users.router)
app.include_router(metrics.router)
app.include_router(sources.router)


@app.get("/health")
def health_check():
    return {"status": "ok"}
