import secrets
import uuid
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

from app.core.config import Settings, get_settings


def get_current_user_id(
    x_user_id: Annotated[str, Header()],
    x_api_key: Annotated[str, Header()],
    settings: Settings = Depends(get_settings),
) -> uuid.UUID:
    """
    Extract and verify the authenticated user from proxy headers.

    All auth extraction lives here. Routers depend only on this function —
    no direct header parsing elsewhere.
    """
    if not secrets.compare_digest(x_api_key, settings.API_SECRET_KEY):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API key",
        )
    try:
        return uuid.UUID(x_user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format",
        )
