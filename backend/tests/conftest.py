"""
Pytest configuration and fixtures
"""
import pytest
import asyncio
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import os
from app.main import app
from app.core.database import Base, get_db
from app.core.config import settings

# Test database URL (in-memory SQLite for speed)
TEST_DATABASE_URL = "sqlite:///:memory:"

# Create test engine
test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

# Create test session factory
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


# Note: event_loop fixture is not needed for TestClient
# TestClient handles async operations internally using httpx.Client
# which manages its own event loop in a separate thread


@pytest.fixture(scope="function")
def db():
    """Create a fresh database for each test"""
    # Create tables
    Base.metadata.create_all(bind=test_engine)
    
    # Create session
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # Drop tables
        Base.metadata.drop_all(bind=test_engine)


@pytest.fixture(scope="function")
def client(db):
    """Create a test client with database override"""
    from app.core.security import get_current_user
    
    def override_get_db():
        try:
            yield db
        finally:
            pass
    
    # Override database dependency
    app.dependency_overrides[get_db] = override_get_db
    
    # Use TestClient as context manager - it handles async properly
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client
    
    # Clear all overrides after test
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db):
    """Create a test user"""
    from app.models.user import User
    from app.core.security import get_password_hash
    
    user = User(
        email="test@example.com",
        hashed_password=get_password_hash("testpassword123"),
        full_name="Test User",
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def auth_headers(client, test_user):
    """Get authentication headers for test user"""
    from app.core.security import create_access_token, get_current_user
    
    # Override get_current_user to return test_user
    def override_get_current_user():
        return test_user
    
    app.dependency_overrides[get_current_user] = override_get_current_user
    
    token = create_access_token(data={"sub": str(test_user.id), "email": test_user.email})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def test_project(db, test_user):
    """Create a test project"""
    from app.models.project import Project
    
    project = Project(
        name="Test Project",
        description="Test Description",
        owner_id=test_user.id,
        is_active=True
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project
