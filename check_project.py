from app.core.database import SessionLocal
from app.models.project import Project

db = SessionLocal()

# Check project 8
p = db.query(Project).filter(Project.id == 8).first()
if p:
    print(f"Project 8: {p.name}")
    print(f"Org ID: {p.organization_id}")
    print(f"Owner User ID: {p.owner_user_id}")
else:
    print("Project 8 NOT FOUND")
    # List all projects
    all_projects = db.query(Project).all()
    print(f"Available projects: {len(all_projects)}")
    for proj in all_projects[:5]:
        print(f"  - ID {proj.id}: {proj.name} (org: {proj.organization_id})")

db.close()
