"""Authentication dependency — dual-mode.

Primary:  JWT Bearer token (mobile app, new auth)
Fallback: X-User-Id + X-Api-Key headers (legacy Next.js proxy)

All routers depend on ``get_current_user_id`` — no direct header parsing
elsewhere.
"""

import secrets
import uuid

from fastapi import Depends, HTTPException, Request, status

from app.core.config import Settings, get_settings
from app.core.jwt import extract_user_id, verify_access_token


def get_current_user_id(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> uuid.UUID:
    """Extract the authenticated user's ID from the request.

    1. Check for ``Authorization: Bearer <token>`` (mobile / JWT auth).
    2. Fall back to ``X-User-Id`` + ``X-Api-Key`` headers (legacy web proxy).
    3. Raise 401 if neither is present/valid.
    """
    # --- 1. JWT Bearer token (primary) ---------------------------------
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        payload = verify_access_token(token, settings)
        return extract_user_id(payload)

    # --- 2. Legacy header-based auth (backward compat) -----------------
    api_key = request.headers.get("X-Api-Key")
    x_user_id = request.headers.get("X-User-Id")

    if api_key and x_user_id and settings.API_SECRET_KEY:
        if secrets.compare_digest(api_key, settings.API_SECRET_KEY):
            try:
                return uuid.UUID(x_user_id)
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid user ID format",
                )

    # --- 3. No valid auth found ----------------------------------------
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )
