from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from ..models.postgres_model import User as UserORM
from ..schemas.pydantic_model import User as UserSchema


def create_user_in_db(
    supabase_user_id: str,
    email: str,
    first_name: str,
    last_name: str,
    db: Session
) -> UserSchema:

    # Check if user already exists
    existing_user = db.query(UserORM).filter(UserORM.email == email).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already exists in the database"
        )

    # Create new user
    new_user = UserORM(
        id=supabase_user_id,
        email=email,
        first_name=first_name,
        last_name=last_name
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Convert ORM → Pydantic
    return UserSchema(
        id=str(new_user.id),
        email=new_user.email,
        first_name=new_user.first_name,
        last_name=new_user.last_name
    )