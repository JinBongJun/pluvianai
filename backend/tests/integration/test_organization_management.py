import pytest
from fastapi import status
from app.models.organization import Organization
from app.models.project import Project
from app.models.subscription import Subscription
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


def test_organization_list_uses_account_subscription_plan(client, db, test_user, auth_headers):
    db.add(Subscription(user_id=test_user.id, plan_type="starter", status="active"))
    db.add(Organization(name="Starter Org", owner_id=test_user.id, plan_type="free"))
    db.commit()

    response = client.get("/api/v1/organizations", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    assert data[0]["plan_type"] == "starter"


def test_starter_plan_allows_multiple_organizations(client, db, test_user, auth_headers):
    db.add(Subscription(user_id=test_user.id, plan_type="starter", status="active"))
    db.add(Organization(name="Existing Org", owner_id=test_user.id, plan_type="free"))
    db.commit()

    response = client.post(
        "/api/v1/organizations",
        json={"name": "Second Org", "description": "starter should allow >1 org"},
        headers=auth_headers,
    )
    assert response.status_code == 201


def test_org_limit_error_includes_normalized_details(client, db, test_user, auth_headers):
    # Free plan allows exactly 1 organization.
    first = client.post(
        "/api/v1/organizations",
        json={"name": "First Org", "description": "fill free slot"},
        headers=auth_headers,
    )
    assert first.status_code == 201

    response = client.post(
        "/api/v1/organizations",
        json={"name": "Blocked Org", "description": "should hit org cap"},
        headers=auth_headers,
    )
    assert response.status_code == 403
    body = response.json()
    payload = body.get("detail") or body.get("error") or {}
    direct_code = payload.get("code")
    details = payload.get("details") or {}
    nested_payload = details if isinstance(details, dict) else {}
    if isinstance(nested_payload.get("details"), dict):
        nested_payload = nested_payload["details"]
    code = direct_code or (details.get("code") if isinstance(details, dict) else None)
    assert code == "ORG_LIMIT_REACHED"
    assert nested_payload.get("metric") == "organizations"
    assert isinstance(nested_payload.get("remaining"), int)
    assert nested_payload.get("remaining") == 0
    assert isinstance(nested_payload.get("reset_at"), str)
