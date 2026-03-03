"""Sources router — GET /sources and POST /sources."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import DataSource
from app.schemas.sources import SourceCreate, SourceResponse

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("", response_model=list[SourceResponse])
def list_sources(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """List all data sources for the authenticated user.
    Not paginated — users will have a small number of sources.
    """
    sources = (
        db.query(DataSource)
        .filter(DataSource.user_id == user_id)
        .order_by(DataSource.created_at.desc())
        .all()
    )
    return sources


@router.post("", response_model=SourceResponse, status_code=201)
def create_source(
    body: SourceCreate,
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    source = DataSource(
        user_id=user_id,
        source_type=body.source_type,
        config=body.config,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source
