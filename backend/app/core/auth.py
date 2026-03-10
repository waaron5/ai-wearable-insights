"""Authentication dependency — JWT Bearer token.

All routers depend on ``get_current_user_id`` — no direct header parsing
elsewhere.
"""

import uuid

from fastapi import Depends, HTTPException, Request, status

from app.core.config import Settings, get_settings
from app.core.jwt import extract_user_id, verify_access_token


def get_current_user_id(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> uuid.UUID:
    """Extract the authenticated user's ID from a JWT Bearer token.

    Raises 401 if the token is missing or invalid.
    """
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        payload = verify_access_token(token, settings)
        return extract_user_id(payload)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
