import sys
import os

# Add backend to sys.path
sys.path.insert(0, os.path.join(os.getcwd(), 'backend'))

from app.core.database import SessionLocal
from app.models.user import User
from app.api.v1.endpoints.organizations import list_org_projects
from app.services.project_service import ProjectService
from app.services.organization_service import OrganizationService
from app.infrastructure.repositories.project_repository import ProjectRepository
from app.infrastructure.repositories.organization_repository import OrganizationRepository
from app.infrastructure.repositories.organization_member_repository import OrganizationMemberRepository

def reproduce():
    with open("project_error.txt", "w", encoding="utf-8") as f:
        f.write("REPRODUCTION STARTED\n")
        db = SessionLocal()
        try:
            # 1. Get test user
            user = db.query(User).filter(User.email == 'test@example.com').first()
            if not user:
                f.write("User test@example.com not found\n")
                return
            
            f.write(f"User found: {user.email} (ID: {user.id})\n")

            # 2. Setup dependencies manually
            org_repo = OrganizationRepository(db)
            member_repo = OrganizationMemberRepository(db)
            project_repo = ProjectRepository(db)
            
            org_service = OrganizationService(org_repo, member_repo, db)
            project_service = ProjectService(project_repo, org_repo, db)

            target_org_id = 3
            f.write(f"Attempting to list projects for Org ID: {target_org_id}...\n")

            # 3. Call the function
            projects = list_org_projects(
                org_id=target_org_id,
                include_stats=False, # Try without stats first to keep it simple, or True as per original error
                search=None,
                db=db,
                current_user=user,
                org_service=org_service,
                project_service=project_service
            )
            
            f.write(f"Success! Found {len(projects)} projects.\n")
            for p in projects:
                f.write(f" - {p.name} (ID: {p.id}, Usage Mode: {p.usage_mode})\n")
            
        except Exception as e:
            f.write("CAUGHT EXCEPTION:\n")
            import traceback
            traceback.print_exc(file=f)
        finally:
            db.close()

if __name__ == "__main__":
    reproduce()
