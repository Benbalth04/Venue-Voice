import uuid
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..auth.jwt import get_current_user_payload
from ..db.postgres import get_db_connection
from ..models.postgres_model import User as UserORM

router = APIRouter()


@router.post("/users/bootstrap")
def bootstrap_user(
    payload: dict[str, Any] | None = None,  # reserved for future client data
    user: dict[str, Any] = Depends(get_current_user_payload),
    db: Session = Depends(get_db_connection),
):
    sub = user.get("sub")
    email = user.get("email")
    meta = user.get("user_metadata") or {}

    user_id = uuid.UUID(str(sub))

    existing = db.query(UserORM).filter(UserORM.id == user_id).first()
    if existing:
        return {"ok": True, "created": False, "user_id": str(existing.id)}

    first_name = str(meta.get("first_name") or "User")
    last_name = str(meta.get("last_name") or "Unknown")

    new_user = UserORM(
        id=user_id,
        email=str(email or ""),
        first_name=first_name,
        last_name=last_name,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"ok": True, "created": True, "user_id": str(new_user.id)}

