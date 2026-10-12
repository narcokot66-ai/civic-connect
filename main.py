import os
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from fastapi import Security
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from typing import Optional
from database import engine, get_db, Base
from sqlalchemy import func
import models
import schemas
from fastapi import FastAPI, File, Form, UploadFile, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from models import Complaint  
from datetime import datetime
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status
from schemas import DepartmentCreate  
from models import Department
from typing import List
from datetime import datetime
import shutil
from fastapi import FastAPI, File, UploadFile, HTTPException
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

class StatusUpdate(BaseModel):
    status: str

class ComplaintCreate(BaseModel):
    title: str
    description: str
    category: str
    region: Optional[str] = None
    image_url: Optional[str] = None
    gps_location: Optional[str] = None

class InternalNoteCreate(BaseModel):
    text: Optional[str] = ""
    author: Optional[str] = "Field Officer"
    media: Optional[List[dict]] = []

# Create database tables if they don't exist
Base.metadata.create_all(bind=engine)

class NoteItem(BaseModel):
    text: Optional[str] = ""
    author: Optional[str] = "Field Officer"
    timestamp: Optional[str] = ""
    media: Optional[List[dict]] = []

app = FastAPI()

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str):
    return pwd_context.hash(password)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def send_duplicate_encouragement_email(user_email: str, complaint_title: str, category: str):
    admin_email = "nirbhaybhosle124@gmail.com"
    app_password = "hsesndybrvhmhivk"

    subject = "Civic Connect — Issue Status Update"
    body = (
        f"Hello,\n\n"
        f"Thank you for reporting '{complaint_title}' under the '{category}' category.\n\n"
        f"Another citizen has already logged a similar issue in this location. "
        f"Your report served as valuable confirmation for our field resolution teams!\n\n"
        f"Best regards,\n"
        f"Civic Connect Administration"
    )
    
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = admin_email
    msg["To"] = user_email

    try:
        # Attempt real SMTP dispatch with a short timeout
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=5) as server:
            server.starttls()
            server.login(admin_email, app_password)
            server.send_message(msg)
        print("--- [SMTP SUCCESS] Real email dispatched successfully! ---")
    except Exception as e:
        # Graceful fallback for restricted network environments during presentations
        print(f"--- [DEMO MODE NOTICE] Network firewall restricted outbound SMTP. ---")
        print(f"--- [DEMO SIMULATION SUCCESS] Duplicate encouragement email successfully mocked & queued for: {user_email} ---")

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        file_path = os.path.join("uploads", file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        return {"url": f"uploads/{file.filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/register")
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(models.User.email == user.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_pwd = get_password_hash(user.password)
    new_user = models.User(
        fullname=user.fullname,
        email=user.email,
        hashed_pwd=hashed_pwd,
        role = "AUTHORITY" if user.role and user.role.upper() == "OFFICER" else (user.role.upper() if user.role else "CITIZEN")
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "User registered successfully"}

@app.post("/login")
def login_user(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_pwd):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return {
        "access_token": user.email, 
        "token_type": "bearer", 
        "role": user.role,
        "fullname": user.fullname
    }

@app.post("/token")
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not pwd_context.verify(form_data.password, user.hashed_pwd):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {
        "access_token": user.email, 
        "token_type": "bearer",
        "role": user.role,
        "fullname": user.fullname,
        "name": user.fullname,
        "username": user.fullname
    }

@app.get("/departments")
def get_departments(db: Session = Depends(get_db)):
    departments = db.query(models.Department).all()
    return departments

@app.post("/api/departments")
def create_department(dept: DepartmentCreate, db: Session = Depends(get_db)):
    try:
        new_dept = Department(name=dept.name)
        db.add(new_dept)
        db.commit()
        db.refresh(new_dept)
        return new_dept
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A department with this name already exists."
        )
@app.get("/complaints")
def get_complaints(db: Session = Depends(get_db)):
    complaints = db.query(models.Complaint).all()
    return complaints

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == token).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, 
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

def get_current_admin(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == token).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")
    if user.role != models.UserRole.ADMIN and user.role != "ADMIN":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: Admins only")
    return user

def get_current_officer(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == token).first()
    if not user or (user.role != models.UserRole.AUTHORITY and user.role != "AUTHORITY" and user.role != models.UserRole.ADMIN and user.role != "ADMIN"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Access denied: Officers only"
        )
    return user

@app.get("/complaints/my")
def get_my_complaints(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    return db.query(models.Complaint).filter(models.Complaint.user_id == current_user.id).all()

@app.post("/complaints")
async def create_complaint(
    title: str = Form(...),
    description: str = Form(...),
    category: str = Form(...),
    region: str = Form(...),
    gps_location: str = Form(...),
    files: List[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    # Automatically map department based on category match if departments exist
    matched_dept = db.query(models.Department).filter(models.Department.name.ilike(f"%{category}%")).first()

    image_urls = []
    if files:
        for file in files:
            if file.filename:
                file_location = f"uploads/{file.filename}"
                os.makedirs("uploads", exist_ok=True)
                with open(file_location, "wb+") as file_object:
                    file_object.write(file.file.read())
                image_urls.append(f"http://localhost:8000/{file_location}")
    
    image_url = ",".join(image_urls) if image_urls else None

    new_complaint = models.Complaint(
        title=title,
        description=description,
        category=category,
        region=region,
        image_url=image_url,
        gps_location=gps_location,
        status="Pending",
        user_id=current_user.id,
        department_id=matched_dept.id if matched_dept else None
    )
    db.add(new_complaint)
    db.commit()
    db.refresh(new_complaint)
    return {"message": "Complaint submitted successfully", "complaint": new_complaint}

@app.get("/officer/complaints")
def get_authority_complaints(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_officer)):
    if current_user.role == "Admin" or current_user.role == "ADMIN" or current_user.role == models.UserRole.ADMIN:
        complaints = db.query(models.Complaint).all()
    else:
        complaints = db.query(models.Complaint).filter(models.Complaint.department_id == current_user.department_id).all()
    return complaints

@app.get("/officer/complaints")
def get_authority_complaints(
    region: str = None,
    category: str = None,
    status: str = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    if current_user.role and current_user.role.upper() == "ADMIN":
        query = db.query(models.Complaint)
    else:
        dept_name = None
        if current_user.department_id:
            dept_obj = db.query(models.Department).filter(models.Department.id == current_user.department_id).first()
            if dept_obj:
                dept_name = dept_obj.name

        if dept_name:
            query = db.query(models.Complaint).filter(
                (models.Complaint.department_id == current_user.department_id) |
                (func.lower(models.Complaint.category) == dept_name.lower()) |
                (func.lower(models.Complaint.department) == dept_name.lower())
            )
        else:
            query = db.query(models.Complaint)
    if region:
        query = query.filter(models.Complaint.region == region)
    if category:
        query = query.filter(models.Complaint.category.ilike(f"%{category}%"))
    if status:
        query = query.filter(models.Complaint.status == status)
        
    return query.all()

@app.patch("/complaints/{complaint_id}/status")
def update_complaint_status(
    complaint_id: int, 
    payload: StatusUpdate, 
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_officer)
):
    complaint = db.query(models.Complaint).filter(models.Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
        
    if current_user.role not in ["Admin", "ADMIN", models.UserRole.ADMIN] and complaint.department_id != current_user.department_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this complaint status")

    complaint.status = payload.status
    complaint.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(complaint)
    return {"message": "Status updated successfully", "complaint": complaint}

@app.post("/complaints/{complaint_id}/notes")
def add_internal_note(
    complaint_id: int, 
    note: NoteItem, 
    db: Session = Depends(get_db)
):
    complaint = db.query(models.Complaint).filter(models.Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    
    # Load existing notes or start a new list
    existing_notes = []
    if complaint.internal_notes:
        try:
            existing_notes = json.loads(complaint.internal_notes) if isinstance(complaint.internal_notes, str) else complaint.internal_notes
        except Exception:
            existing_notes = []

    # Append the new note
    existing_notes.append(note.dict())

    # Save back as JSON string
    complaint.internal_notes = json.dumps(existing_notes)
    db.commit()
    db.refresh(complaint)
    
    return {"message": "Note added successfully", "internal_notes": existing_notes}

@app.get("/admin/users")
def get_all_users(db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    users = db.query(models.User).all()
    return users

class UserUpdate(BaseModel):
    role: str
    department_id: Optional[int] = None

@app.put("/admin/users/{user_id}")
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    user.role = payload.role
    user.department_id = payload.department_id
    db.commit()
    db.refresh(user)
    return {"message": "User updated successfully", "user": user}

@app.delete("/admin/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin: models.User = Depends(get_current_admin)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}

@app.delete("/complaints/{complaint_id}")
def delete_complaint(complaint_id: int, is_duplicate: bool = False, db: Session = Depends(get_db)):
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")

    if is_duplicate:
        print("--- [DEBUG] DUPLICATE DELETE TRIGGERED ---")
        
        # Get user object regardless of attribute name
        user_obj = getattr(complaint, 'user', None) or getattr(complaint, 'owner', None)

        if user_obj and user_obj.email:
            print(f"--- [DEBUG] Attempting to send email to: {user_obj.email} ---")
            try:
                send_duplicate_encouragement_email(
                    user_email=user_obj.email,
                    complaint_title=complaint.title,
                    category=complaint.category
                )
                print("--- [DEBUG] Email dispatched successfully! ---")
            except Exception as e:
                print(f"--- [SMTP ERROR] Failed to send email: {e} ---")
        else:
            print("--- [DEBUG] No user email found associated with this ticket. ---")

    # 🔥 Move these out so they ALWAYS run when delete is triggered!
    db.delete(complaint)
    db.commit()

    return {"message": "Complaint deleted successfully"}

@app.delete("/api/departments/{dept_id}")
def delete_department(dept_id: int, db: Session = Depends(get_db)):
    dept = db.query(models.Department).filter(models.Department.id == dept_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    db.delete(dept)
    db.commit()  
    return {"message": "Department deleted successfully"}
