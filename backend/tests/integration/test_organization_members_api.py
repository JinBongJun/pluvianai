from app.main import app
from app.core.security import get_current_user, get_password_hash
from app.models.subscription import Subscription
from app.models.organization import Organization, OrganizationMember
from app.models.user import User


def _as_user(user):
    app.dependency_overrides[get_current_user] = lambda: user


def test_organization_members_list_add_remove_flow(client, db, test_user):
    owner = test_user
    candidate = User(
        email="candidate@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="Candidate User",
        is_active=True,
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    org = Organization(name="Security Org", owner_id=owner.id, plan_type="free")
    db.add(org)
    db.commit()
    db.refresh(org)

    owner_membership = OrganizationMember(
        organization_id=org.id,
        user_id=owner.id,
        role="owner",
    )
    db.add(owner_membership)
    db.commit()

    _as_user(owner)

    response = client.get(f"/api/v1/organizations/{org.id}/members")
    assert response.status_code == 200
    members = response.json()
    assert len(members) == 1
    assert members[0]["email"] == owner.email
    assert members[0]["role"] == "owner"

    response = client.post(
        f"/api/v1/organizations/{org.id}/members",
        json={"email": candidate.email, "role": "viewer"},
    )
    assert response.status_code == 201
    added = response.json()
    assert added["email"] == candidate.email
    assert added["role"] == "viewer"

    response = client.get(f"/api/v1/organizations/{org.id}/members")
    assert response.status_code == 200
    members = response.json()
    assert len(members) == 2
    created_member = next(member for member in members if member["email"] == candidate.email)

    response = client.delete(f"/api/v1/organizations/{org.id}/members/{created_member['id']}")
    assert response.status_code == 204

    response = client.get(f"/api/v1/organizations/{org.id}/members")
    assert response.status_code == 200
    members = response.json()
    assert len(members) == 1
    assert members[0]["email"] == owner.email


def test_organization_member_listing_and_mutation_require_owner_or_admin(client, db, test_user):
    owner = test_user
    viewer = User(
        email="viewer@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="Viewer User",
        is_active=True,
    )
    candidate = User(
        email="candidate-two@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="Candidate Two",
        is_active=True,
    )
    db.add_all([viewer, candidate])
    db.commit()
    db.refresh(viewer)
    db.refresh(candidate)

    org = Organization(name="Permission Org", owner_id=owner.id, plan_type="free")
    db.add(org)
    db.commit()
    db.refresh(org)

    db.add_all(
        [
            OrganizationMember(organization_id=org.id, user_id=owner.id, role="owner"),
            OrganizationMember(organization_id=org.id, user_id=viewer.id, role="viewer"),
        ]
    )
    db.commit()

    _as_user(viewer)

    response = client.get(f"/api/v1/organizations/{org.id}/members")
    assert response.status_code == 403
    assert "Current role: viewer" in response.text

    response = client.post(
        f"/api/v1/organizations/{org.id}/members",
        json={"email": candidate.email, "role": "member"},
    )
    assert response.status_code == 403
    assert "Current role: viewer" in response.text

    viewer_membership = (
        db.query(OrganizationMember)
        .filter(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.user_id == viewer.id,
        )
        .first()
    )
    response = client.delete(f"/api/v1/organizations/{org.id}/members/{viewer_membership.id}")
    assert response.status_code == 403
    assert "Current role: viewer" in response.text


def test_team_member_limit_error_has_normalized_details(client, db, test_user):
    owner = test_user
    db.add(Subscription(user_id=owner.id, plan_type="free", status="active"))
    db.commit()

    org = Organization(name="Limit Org", owner_id=owner.id, plan_type="free")
    db.add(org)
    db.commit()
    db.refresh(org)

    owner_membership = OrganizationMember(
        organization_id=org.id,
        user_id=owner.id,
        role="owner",
    )
    db.add(owner_membership)

    first = User(
        email="limit-first@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="Limit First",
        is_active=True,
    )
    second = User(
        email="limit-second@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="Limit Second",
        is_active=True,
    )
    blocked = User(
        email="limit-blocked@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="Limit Blocked",
        is_active=True,
    )
    db.add_all([first, second, blocked])
    db.commit()
    db.refresh(first)
    db.refresh(second)
    db.refresh(blocked)

    db.add_all(
        [
            OrganizationMember(organization_id=org.id, user_id=first.id, role="member"),
            OrganizationMember(organization_id=org.id, user_id=second.id, role="viewer"),
        ]
    )
    db.commit()

    _as_user(owner)
    response = client.post(
        f"/api/v1/organizations/{org.id}/members",
        json={"email": blocked.email, "role": "member"},
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
    assert code == "TEAM_MEMBER_LIMIT_REACHED"
    assert nested_payload.get("metric") == "team_members"
    assert nested_payload.get("current") == 3
    assert nested_payload.get("limit") == 3
    assert nested_payload.get("remaining") == 0
    assert nested_payload.get("reset_at") is None


def test_list_organizations_includes_membership_metadata(client, db, test_user):
    owner = test_user
    invited = User(
        email="org-list-invited@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="Org List Invited",
        is_active=True,
    )
    db.add(invited)
    db.commit()
    db.refresh(invited)

    owned_org = Organization(name="Owned Org", owner_id=owner.id, plan_type="free")
    invited_org = Organization(name="Invited Org", owner_id=owner.id, plan_type="free")
    db.add_all([owned_org, invited_org])
    db.commit()
    db.refresh(owned_org)
    db.refresh(invited_org)

    db.add_all(
        [
            OrganizationMember(organization_id=owned_org.id, user_id=owner.id, role="owner"),
            OrganizationMember(organization_id=invited_org.id, user_id=owner.id, role="owner"),
            OrganizationMember(organization_id=invited_org.id, user_id=invited.id, role="viewer"),
        ]
    )
    db.commit()

    _as_user(invited)
    response = client.get("/api/v1/organizations?include_stats=false")
    assert response.status_code == 200
    items = response.json()
    assert len(items) == 1
    assert items[0]["name"] == "Invited Org"
    assert items[0]["current_user_role"] == "viewer"
    assert items[0]["membership_source"] == "invited"


def test_org_viewer_cannot_create_project_in_shared_org(client, db, test_user):
    owner = test_user
    viewer = User(
        email="org-viewer-project-create@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="Org Viewer Create Project",
        is_active=True,
    )
    db.add(viewer)
    db.commit()
    db.refresh(viewer)

    org = Organization(name="Create Guard Org", owner_id=owner.id, plan_type="free")
    db.add(org)
    db.commit()
    db.refresh(org)

    db.add_all(
        [
            OrganizationMember(organization_id=org.id, user_id=owner.id, role="owner"),
            OrganizationMember(organization_id=org.id, user_id=viewer.id, role="viewer"),
        ]
    )
    db.commit()

    _as_user(viewer)
    response = client.post(
        "/api/v1/projects",
        json={
            "name": "Viewer Should Not Create",
            "description": "should fail",
            "organization_id": org.id,
        },
    )
    assert response.status_code == 403
    assert "permission" in response.text.lower()


def test_get_organization_includes_membership_metadata(client, db, test_user):
    owner = test_user
    invited = User(
        email="org-detail-invited@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="Org Detail Invited",
        is_active=True,
    )
    db.add(invited)
    db.commit()
    db.refresh(invited)

    org = Organization(name="Detail Visibility Org", owner_id=owner.id, plan_type="free")
    db.add(org)
    db.commit()
    db.refresh(org)

    db.add_all(
        [
            OrganizationMember(organization_id=org.id, user_id=owner.id, role="owner"),
            OrganizationMember(organization_id=org.id, user_id=invited.id, role="member"),
        ]
    )
    db.commit()

    _as_user(invited)
    response = client.get(f"/api/v1/organizations/{org.id}?include_stats=false")
    assert response.status_code == 200
    body = response.json()
    assert body["current_user_role"] == "member"
    assert body["membership_source"] == "invited"


def test_org_projects_list_exposes_access_context_for_org_only_visibility(client, db, test_user):
    owner = test_user
    viewer = User(
        email="org-project-list-viewer@example.com",
        hashed_password=get_password_hash("password123"),
        full_name="Org Project List Viewer",
        is_active=True,
    )
    db.add(viewer)
    db.commit()
    db.refresh(viewer)

    org = Organization(name="Visibility Org", owner_id=owner.id, plan_type="free")
    db.add(org)
    db.commit()
    db.refresh(org)

    db.add_all(
        [
            OrganizationMember(organization_id=org.id, user_id=owner.id, role="owner"),
            OrganizationMember(organization_id=org.id, user_id=viewer.id, role="viewer"),
        ]
    )
    db.commit()

    _as_user(owner)
    response = client.post(
        "/api/v1/projects",
        json={
            "name": "Org Visible Project",
            "description": "Visible through organization membership",
            "organization_id": org.id,
        },
    )
    assert response.status_code == 201
    project = response.json()

    _as_user(viewer)
    response = client.get(f"/api/v1/organizations/{org.id}/projects")
    assert response.status_code == 200
    items = response.json()
    match = next(item for item in items if item["id"] == project["id"])
    assert match["access_source"] == "organization_member"
    assert match["role"] is None
    assert match["org_role"] == "viewer"
    assert match["has_project_access"] is False
    assert match["created_by_me"] is False
    assert match["entitlement_scope"] == "account"
