import enum
from sqlalchemy import Text
from sqlalchemy import Column, Integer, String, Enum, ForeignKey
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
from sqlalchemy import Column, DateTime
from sqlalchemy import Column, String, Text, Integer

class UserRole(str, enum.Enum):
    CITIZEN = "CITIZEN"
    AUTHORITY = "AUTHORITY"
    ADMIN = "Admin"  

class ComplaintStatus(str, enum.Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"

class User(Base):
    __tablename__ = "users"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    fullname = Column(String(100), nullable=True)
    email = Column(String(100), unique=True, index=True)
    hashed_pwd = Column(String(255))
    role = Column(Enum(UserRole), default=UserRole.CITIZEN)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    
    complaints = relationship("Complaint", back_populates="owner")

class Department(Base):
    __tablename__ = "departments"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True)

class Complaint(Base):
    __tablename__ = "complaints"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(100))
    description = Column(String(255))
    category = Column(String(100))
    region = Column(String(100))
    status = Column(String(50), default="PENDING")
    image_url = Column(Text, nullable=True)
    gps_location = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    department_id = Column(Integer, ForeignKey("departments.id"))
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    internal_notes = Column(Text, nullable=True, default="[]")

    owner = relationship("User", back_populates="complaints")
    department = relationship("Department")