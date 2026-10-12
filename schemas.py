from typing import Optional
from pydantic import BaseModel
from models import UserRole
from pydantic import BaseModel
from pydantic import BaseModel
from typing import Optional, List

class InternalNoteCreate(BaseModel):
    text: Optional[str] = ""
    author: Optional[str] = "Field Officer"
    media: Optional[List[dict]] = []

class UserCreate(BaseModel):
    fullname: str
    email: str
    password: str
    role: Optional[str] = "CITIZEN"

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    role: UserRole

    class Config:
        from_attributes = True

class ComplaintCreate(BaseModel):
    title: str
    description: str
    category: str
    region: Optional[str] = None
    image_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    gps_location: Optional[str] = None

class DepartmentCreate(BaseModel):
    name: str  