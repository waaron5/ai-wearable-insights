"""Auth schemas — request/response models for /auth endpoints."""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

class SignupRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class AppleSignInRequest(BaseModel):
    """Identity token from the iOS Sign in with Apple SDK."""
    identity_token: str
    # Apple only provides name/email on the *first* sign-in; subsequent
    # logins return `sub` only.  The client forwards if available.
    full_name: str | None = None
    email: str | None = None


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------

class AuthUserResponse(BaseModel):
    """User data returned alongside auth tokens."""
    id: uuid.UUID
    email: str
    name: str | None
    timezone: str
    notification_email: str | None
    email_notifications_enabled: bool
    onboarded_at: datetime | None
    data_sharing_consent: bool
    data_sharing_consented_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: AuthUserResponse


class AccessTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
