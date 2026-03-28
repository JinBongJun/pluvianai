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


def test_organization_member_mutation_requires_owner_or_admin(client, db, test_user):
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
    assert response.status_code == 200

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
