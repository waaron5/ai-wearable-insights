from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # AI (Vertex AI — HIPAA-eligible with GCP BAA)
    GCP_PROJECT_ID: str = ""
    GCP_LOCATION: str = "us-central1"
    GOOGLE_APPLICATION_CREDENTIALS: str = ""
    AI_PROVIDER: str = "vertexai"
    AI_MODEL: str = "gemini-2.0-flash"

    # Email
    RESEND_API_KEY: str = ""

    # JWT auth
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Apple Sign-In
    APPLE_BUNDLE_ID: str = "com.vitalview.app"

    # APNs push notifications (token-based auth)
    APNS_KEY_ID: str = ""       # 10-char Key ID from Apple Developer portal
    APNS_TEAM_ID: str = ""      # 10-char Team ID
    APNS_AUTH_KEY_PATH: str = "" # Path to .p8 private key file
    APNS_USE_SANDBOX: bool = True  # True for dev, False for production

    # Anonymous data lake – HMAC secret for de-identifying user IDs
    # MUST be kept separate from API_SECRET_KEY; rotate carefully (changes all profile IDs)
    ANONYMOUS_ID_SECRET: str = ""

    # Frontend URL (for email links, CORS if ever needed)
    FRONTEND_URL: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
