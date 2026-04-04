"""
Authentication routes.
"""
from datetime import timedelta
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from api.schemas import (
    AuthResponse,
    GoogleLoginRequest,
    LoginRequest,
    RegisterRequest,
    UserResponse,
)
from app.config import get_settings
from app.db import get_db
from app.dependencies import get_current_user
from app.models import User
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(tags=["auth"])
settings = get_settings()


def _issue_auth_response(user: User) -> AuthResponse:
    token = create_access_token(user.id, expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    return AuthResponse(access_token=token, token_type="bearer", user=UserResponse.model_validate(user))


def _verify_google_identity(id_token_value: str) -> tuple[str, str, str]:
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured",
        )

    try:
        from google.auth.transport.requests import Request as GoogleAuthRequest
        from google.oauth2 import id_token as google_id_token
    except Exception as exc:  # pragma: no cover - optional dependency guard
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in dependencies are unavailable",
        ) from exc

    try:
        payload = google_id_token.verify_oauth2_token(
            id_token_value,
            GoogleAuthRequest(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google identity token") from exc

    issuer = str(payload.get("iss") or "")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token issuer")

    google_sub = str(payload.get("sub") or "").strip()
    email = str(payload.get("email") or "").lower().strip()
    email_verified = bool(payload.get("email_verified"))
    display_name = str(payload.get("name") or email.split("@")[0] or "Google User").strip()

    if len(display_name) < 2:
        display_name = "Google User"

    if not google_sub or not email or not email_verified:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google account email is not verified")

    return google_sub, email, display_name[:120]


@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        email=payload.email.lower(),
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return _issue_auth_response(user)


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    return _issue_auth_response(user)


@router.post("/google", response_model=AuthResponse)
def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    google_sub, email, display_name = _verify_google_identity(payload.id_token)
    user = db.query(User).filter(or_(User.google_sub == google_sub, User.email == email)).first()

    if user is None:
        user = User(
            email=email,
            display_name=display_name,
            password_hash=hash_password(f"google-{uuid.uuid4().hex}"),
            google_sub=google_sub,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return _issue_auth_response(user)

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")

    if user.google_sub and user.google_sub != google_sub:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Google account does not match this user")

    user.google_sub = google_sub
    if not user.display_name and display_name:
        user.display_name = display_name

    db.commit()
    db.refresh(user)
    return _issue_auth_response(user)


@router.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)
