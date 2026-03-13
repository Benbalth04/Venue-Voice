from pydantic import BaseModel
from typing import Literal
from pydantic import EmailStr

class User(BaseModel):
    id: str
    email: str
    first_name: str
    last_name: str

class Company(BaseModel):
    id: str
    name: str
    owner_user_id: str

class Location(BaseModel):
    id: str
    name: str
    company_id: str
    created_by: str

class Survey(BaseModel):
    id: str
    company_id: str
    location_id: str | None 
    name: str
    description: str | None
    status: Literal["draft", "active", "archived"]
    active_version_id: str | None
    created_by: str


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    company_name: str
    default_store_name: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    access_token: str
    user: User
    company: Company | None = None