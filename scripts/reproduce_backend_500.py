
import sys
import os
import traceback
from sqlalchemy.orm import Session

# Add backend directory to sys.path
sys.path.append(os.path.abspath("c:/Users/user/Desktop/AgentGuard/backend"))

from app.core.database import SessionLocal
from app.api.v1.endpoints.live_view import list_agents
from app.models.user import User
from app.models.project import Project

def reproduce():
    db = SessionLocal()
    try:
        # 1. Check if project 7 exists
        project = db.query(Project).filter(Project.id == 7).first()
        if not project:
            print("Project 7 not found.")
            return
        
        print(f"Project 7 found: {project.name} (Owner ID: {project.owner_id})")

        # 2. Get the owner
        user = db.query(User).filter(User.id == project.owner_id).first()
        if not user:
            print(f"Owner {project.owner_id} not found. Trying to find a superuser...")
            user = db.query(User).filter(User.is_superuser == True).first()
        
        if not user:
             print("No valid user found to execute request.")
             return

        print(f"Using user: {user.email} (ID: {user.id}, Superuser: {user.is_superuser})")


        # 3. Call list_agents
        print("Calling list_agents(project_id=7)...", flush=True)
        # Remove try/except to let it crash if it fails
        result = list_agents(project_id=7, limit=30, db=db, current_user=user)
        print("VERIFICATION PASSED! Result keys:", result.keys(), flush=True)

    finally:
        db.close()

if __name__ == "__main__":
    reproduce()
