"""Auth router — signup, login, token refresh, Apple Sign-In.

All endpoints are public (no auth required) except GET /auth/me.
"""

import uuid
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from jose import JWTError, jwt as jose_jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.jwt import (
    create_access_token,
    create_refresh_token,
    extract_user_id,
    hash_token,
    verify_refresh_token,
)
from app.models.models import RefreshToken, User
from app.schemas.auth import (
    AccessTokenResponse,
    AppleSignInRequest,
    LoginRequest,
    RefreshRequest,
    SignupRequest,
    TokenResponse,
)
from app.schemas.users import UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])

# ---------------------------------------------------------------------------
# Password hashing (bcrypt — same algo the Next.js signup route used)
# ---------------------------------------------------------------------------
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _issue_tokens(
    user: User,
    db: Session,
    settings: Settings,
) -> TokenResponse:
    """Create access + refresh tokens, persist the refresh token hash, and
    return a ``TokenResponse``."""
    access_token = create_access_token(user.id, user.email, settings)
    raw_refresh, expires_at = create_refresh_token(user.id, settings)

    db_token = RefreshToken(
        user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=expires_at,
    )
    db.add(db_token)
    db.commit()

    return TokenResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
        user=user,  # type: ignore[arg-type]  — pydantic from_attributes handles ORM
    )


# ---------------------------------------------------------------------------
# POST /auth/signup
# ---------------------------------------------------------------------------

@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(
    body: SignupRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    # Check for existing user
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    user = User(
        email=body.email,
        name=body.name,
        hashed_password=pwd_context.hash(body.password),
    )
    db.add(user)
    db.flush()  # assign ID before issuing tokens

    return _issue_tokens(user, db, settings)


# ---------------------------------------------------------------------------
# POST /auth/login
# ---------------------------------------------------------------------------

@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    if not pwd_context.verify(body.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    return _issue_tokens(user, db, settings)


# ---------------------------------------------------------------------------
# POST /auth/refresh
# ---------------------------------------------------------------------------

@router.post("/refresh", response_model=AccessTokenResponse)
def refresh(
    body: RefreshRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    payload = verify_refresh_token(body.refresh_token, settings)
    user_id = extract_user_id(payload)

    # Verify the refresh token exists in DB and is not revoked
    token_hash = hash_token(body.refresh_token)
    db_token = (
        db.query(RefreshToken)
        .filter(
            RefreshToken.token_hash == token_hash,
            RefreshToken.user_id == user_id,
            RefreshToken.revoked_at.is_(None),
        )
        .first()
    )
    if not db_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked or does not exist",
        )

    # Check expiry (belt-and-suspenders — JWT decode already checks exp)
    expires = db_token.expires_at.replace(tzinfo=timezone.utc) if db_token.expires_at.tzinfo is None else db_token.expires_at
    if expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    access_token = create_access_token(user.id, user.email, settings)
    return AccessTokenResponse(access_token=access_token)


# ---------------------------------------------------------------------------
# GET /auth/me  (requires valid access token)
# ---------------------------------------------------------------------------


@router.get("/me", response_model=UserResponse)
def auth_me(
    user_id: uuid.UUID = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    """Validate stored token and return current user.  Used by the mobile
    app on launch to check whether the session is still valid."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


# ---------------------------------------------------------------------------
# POST /auth/apple  — Sign in with Apple
# ---------------------------------------------------------------------------

# Cache Apple's public keys for 24 hours (they rotate infrequently)
_apple_keys_cache: dict | None = None
_apple_keys_fetched_at: datetime | None = None
APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"


async def _get_apple_public_keys() -> dict:
    """Fetch Apple's public JWKS (cached)."""
    global _apple_keys_cache, _apple_keys_fetched_at

    now = datetime.now(timezone.utc)
    if (
        _apple_keys_cache is not None
        and _apple_keys_fetched_at is not None
        and (now - _apple_keys_fetched_at).total_seconds() < 86400
    ):
        return _apple_keys_cache

    async with httpx.AsyncClient() as client:
        resp = await client.get(APPLE_KEYS_URL)
        resp.raise_for_status()
        _apple_keys_cache = resp.json()
        _apple_keys_fetched_at = now
        return _apple_keys_cache


def _verify_apple_identity_token(identity_token: str, bundle_id: str) -> dict:
    """Verify an Apple identity token (JWT signed with RS256).

    Returns the decoded payload containing ``sub``, ``email``, etc.
    """
    try:
        # Decode header to find the key ID
        header = jose_jwt.get_unverified_header(identity_token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Apple identity token",
        )

    kid = header.get("kid")
    if not kid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Apple identity token missing key ID",
        )

    # We need the JWKS synchronously here — but we'll fetch them in the
    # async endpoint and pass them in.  For now, raise if cache is empty.
    if _apple_keys_cache is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Apple public keys not yet loaded",
        )

    # Find matching key
    matching_key = None
    for key in _apple_keys_cache.get("keys", []):
        if key.get("kid") == kid:
            matching_key = key
            break

    if not matching_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Apple identity token signed with unknown key",
        )

    # Build RSA public key and verify
    from jose import jwk
    public_key = jwk.construct(matching_key, algorithm="RS256")

    try:
        payload = jose_jwt.decode(
            identity_token,
            public_key,
            algorithms=["RS256"],
            audience=bundle_id,
            issuer=APPLE_ISSUER,
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Apple identity token verification failed: {e}",
        )

    return payload


@router.post("/apple", response_model=TokenResponse)
async def apple_sign_in(
    body: AppleSignInRequest,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Authenticate via Sign in with Apple.

    Flow:
    1. Client performs native Apple auth and receives an identity token (JWT).
    2. Client sends the identity token to this endpoint.
    3. We verify the token against Apple's public keys.
    4. Look up or create the user by ``apple_user_id`` (Apple ``sub``).
    5. Return access + refresh tokens.
    """
    # Fetch/refresh Apple's public keys
    await _get_apple_public_keys()

    # Verify the identity token
    apple_payload = _verify_apple_identity_token(
        body.identity_token, settings.APPLE_BUNDLE_ID
    )

    apple_sub = apple_payload.get("sub")
    apple_email = apple_payload.get("email") or body.email
    if not apple_sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Apple identity token missing subject",
        )

    # 1. Look up by apple_user_id
    user = db.query(User).filter(User.apple_user_id == apple_sub).first()

    if user:
        # Existing Apple-linked user — issue tokens
        return _issue_tokens(user, db, settings)

    # 2. If email is available, check for existing account to link
    if apple_email:
        user = db.query(User).filter(User.email == apple_email).first()
        if user:
            # Link Apple ID to existing account
            user.apple_user_id = apple_sub
            db.flush()
            return _issue_tokens(user, db, settings)

    # 3. Create new user
    if not apple_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is required for first-time Apple sign-in. "
            "Please revoke VitalView access in Settings → Apple ID → "
            "Sign in with Apple, then try again.",
        )

    user = User(
        email=apple_email,
        name=body.full_name or apple_email.split("@")[0],
        apple_user_id=apple_sub,
        # No password — Apple-only account
    )
    db.add(user)
    db.flush()

    return _issue_tokens(user, db, settings)
