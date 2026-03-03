"""Shared schema utilities — pagination params and paginated response wrapper."""

import uuid
from datetime import date, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

class PaginationParams(BaseModel):
    """Query parameters for paginated list endpoints."""
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class PaginatedResponse(BaseModel, Generic[T]):
    """Standard envelope for all list endpoints."""
    items: list[T]
    total: int
