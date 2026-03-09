"""JWT creation and verification utilities.

Access tokens:  short-lived (default 30 min), embedded in Authorization header.
Refresh tokens: long-lived (default 30 days), stored as SHA-256 hash in DB.
"""

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.core.config import Settings


# ---------------------------------------------------------------------------
# Token creation
# ---------------------------------------------------------------------------

def create_access_token(
    user_id: uuid.UUID,
    email: str,
    settings: Settings,
    expires_delta: timedelta | None = None,
) -> str:
    """Return a signed JWT access token."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(
    user_id: uuid.UUID,
    settings: Settings,
    expires_delta: timedelta | None = None,
) -> tuple[str, datetime]:
    """Return (raw_token, expires_at).

    The raw token is sent to the client.  The *hash* of the token is stored
    in the ``refresh_tokens`` table so the DB never holds a usable secret.
    """
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "type": "refresh",
    }
    raw_token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return raw_token, expire


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------

def verify_access_token(token: str, settings: Settings) -> dict:
    """Decode and validate an access token.  Returns the payload dict."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )
    return payload


def verify_refresh_token(token: str, settings: Settings) -> dict:
    """Decode and validate a refresh token.  Returns the payload dict."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )
    return payload


def extract_user_id(payload: dict) -> uuid.UUID:
    """Pull user_id (UUID) from a decoded JWT payload."""
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject",
        )
    try:
        return uuid.UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid subject in token",
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def hash_token(raw_token: str) -> str:
    """SHA-256 hash used to store refresh tokens in the DB."""
    return hashlib.sha256(raw_token.encode()).hexdigest()
