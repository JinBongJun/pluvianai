import pytest
from fastapi import status
from app.models.organization import Organization
from app.models.project import Project
from app.models.user import User
from app.core.security import get_password_hash

def test_organization_management_flow(client, db, test_user, auth_headers):
    # 1. Create Organization
    response = client.post(
        "/api/v1/organizations",
        json={"name": "Org to Delete", "description": "This org will be deleted"},
        headers=auth_headers
    )
    assert response.status_code == 201
    org_data = response.json()
    org_id = org_data["id"]
    
    # 2. Create a Project in this Organization
    response = client.post(
        "/api/v1/projects",
        json={"name": "Org Project", "organization_id": org_id},
        headers=auth_headers
    )
    assert response.status_code == 201
    project_data = response.json()
    project_id = project_data["id"]
    
    # 3. Verify they exist in DB
    assert db.query(Organization).filter(Organization.id == org_id).first() is not None
    assert db.query(Project).filter(Project.id == project_id).first() is not None
    
    # 4. Update Organization (PATCH)
    new_name = "Updated Org Name"
    response = client.patch(
        f"/api/v1/organizations/{org_id}",
        json={"name": new_name},
        headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["name"] == new_name
    
    # 5. Delete Organization (DELETE)
    response = client.delete(
        f"/api/v1/organizations/{org_id}",
        headers=auth_headers
    )
    assert response.status_code == 204
    
    # 6. Verify Organization is deleted
    db.expire_all()
    org = db.query(Organization).filter(Organization.id == org_id).first()
    assert org is not None
    assert org.is_deleted is True
    assert org.deleted_at is not None
    
    # 7. Verify Project is ALSO deleted (Cascade check)
    project = db.query(Project).filter(Project.id == project_id).first()
    assert project is not None
    assert project.is_deleted is True
    assert project.is_active is False
    assert project.deleted_at is not None

def test_organization_delete_not_owner(client, db, test_user, auth_headers):
    # Create another user
    other_user = User(
        email="other@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="Other User",
        is_active=True
    )
    db.add(other_user)
    db.commit()
    
    # Create org as test_user
    org = Organization(name="Other Org", owner_id=other_user.id)
    db.add(org)
    db.commit()
    org_id = org.id
    
    # Try to delete as test_user (via auth_headers)
    response = client.delete(
        f"/api/v1/organizations/{org_id}",
        headers=auth_headers
    )
    assert response.status_code == 403
    assert "organization owner role" in response.json()["error"]["message"]
