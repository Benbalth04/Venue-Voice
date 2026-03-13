import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from supabase_auth.errors import AuthApiError
from supabase_auth import AuthResponse as SupabaseAuthResponse

from ..db.postgres import get_db_connection
from ..db.supabase import SUPABASE_ADMIN_CLIENT, SUPABASE_CLIENT
from ..models.postgres_model import Company as CompanyORM
from ..models.postgres_model import Location as LocationORM
from ..models.postgres_model import User as UserORM
from ..schemas.pydantic_model import AuthResponse, LoginRequest, SignupRequest

router = APIRouter()

def _try_delete_supabase_user(user_id: str) -> None:
    if not user_id or SUPABASE_ADMIN_CLIENT is None:
        return
    try:
        SUPABASE_ADMIN_CLIENT.auth.admin.delete_user(user_id)
    except Exception:
        pass

@router.post("/signup", response_model=AuthResponse)
async def signup(payload: SignupRequest, db: Session = Depends(get_db_connection)):
    supabase_user_id: str | None = None
    try:
        # -------------------------
        # Sign up user in Supabase
        # -------------------------
        try:
            signup_resp: SupabaseAuthResponse = SUPABASE_CLIENT.auth.sign_up(
                {
                    "email": payload.email,
                    "password": payload.password,
                    "options": {
                        "data": {
                            "first_name": payload.first_name,
                            "last_name": payload.last_name,
                            "display_name": f"{payload.first_name} {payload.last_name}",
                        }
                    },
                }
            )
        except AuthApiError as e:
            if "User already registered" in str(e):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="User with this email already exists",
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Supabase auth error: {str(e)}",
            )

        supabase_user = signup_resp.user
        if not supabase_user or not supabase_user.id:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase did not return a user id",
            )
        supabase_user_id = supabase_user.id

        # -------------------------
        # Log in immediately to get a session
        # -------------------------
        try:
            login_resp: SupabaseAuthResponse = SUPABASE_CLIENT.auth.sign_in_with_password(
                {"email": payload.email, "password": payload.password}
            )
        except AuthApiError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Supabase login failed after signup: {str(e)}",
            )

        if not login_resp.session or not login_resp.session.access_token:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Supabase did not return an access token",
            )
        access_token = login_resp.session.access_token

        # -------------------------
        # Ensure email is not already in Postgres
        # -------------------------
        user_uuid = uuid.UUID(supabase_user_id)
        existing = db.query(UserORM).filter(UserORM.email == str(payload.email)).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already exists in the database",
            )

        # -------------------------
        # Create Postgres records
        # -------------------------
        user = UserORM(
            id=user_uuid,
            email=str(payload.email),
            first_name=payload.first_name,
            last_name=payload.last_name,
            created_at=supabase_user.created_at,
        )
        db.add(user)
        db.flush()

        company = CompanyORM(owner_user_id=user.id, name=payload.company_name)
        db.add(company)
        db.flush()

        location = LocationORM(
            company_id=company.id,
            name=payload.default_store_name,
            created_by=user.id,
        )
        db.add(location)
        db.commit()

        # -------------------------
        # Return internal AuthResponse
        # -------------------------
        return AuthResponse(
            access_token=access_token,
            user={
                "id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name
            },
            company={
                "id": str(company.id),
                "name": company.name,
                "owner_user_id": str(company.owner_user_id),
            },
        )

    # -------------------------
    # Error handling
    # -------------------------
    except HTTPException:
        db.rollback()
        _try_delete_supabase_user(supabase_user_id or "")
        raise
    except Exception as e:
        db.rollback()
        _try_delete_supabase_user(supabase_user_id or "")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: Session = Depends(get_db_connection)):
    try:
        login_resp: SupabaseAuthResponse = SUPABASE_CLIENT.auth.sign_in_with_password(
            {"email": payload.email, "password": payload.password}
        )
    except AuthApiError as e:
        # Map Supabase error messages to HTTP responses
        if "Invalid login credentials" in str(e):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Email or Password",
            )
        else:
            # Fallback for other Supabase auth errors
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Supabase auth error: {str(e)}",
            )

    # Extract tokens and user ID
    supabase_user = login_resp.user
    superbase_session = login_resp.session
    user_id = supabase_user.id if supabase_user else None
    access_token = superbase_session.access_token if superbase_session else None

    if not user_id or not access_token:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase did not return a user id or access token",
        )

    # Ensure user exists in Postgres
    user = db.query(UserORM).filter(UserORM.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not provisioned in Postgres",
        )

    company = db.query(CompanyORM).filter(CompanyORM.owner_user_id == user.id).first()

    return AuthResponse(
        access_token=access_token,
        user={
            "id": str(user.id),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
        },
        company=(
            {
                "id": str(company.id),
                "name": company.name,
                "owner_user_id": str(company.owner_user_id),
            }
            if company
            else None
        ),
    )

@router.post("/logout")
async def logout():
    # Frontend clears its httpOnly cookie; no server-side state kept here.
    return {"message": "Logged out"}