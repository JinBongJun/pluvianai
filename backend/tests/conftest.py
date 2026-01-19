"""
Pytest configuration and fixtures
"""
import pytest
import asyncio
from typing import AsyncGenerator
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
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


@pytest.fixture(scope="function")
def event_loop():
    """Create and manage event loop for async tests.
    
    This ensures proper event loop lifecycle management for async operations.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    # Clean up: cancel pending tasks and close the loop
    try:
        # Cancel all pending tasks
        pending = [task for task in asyncio.all_tasks(loop) if not task.done()]
        for task in pending:
            task.cancel()
        # Wait for tasks to complete (cancelled or finished)
        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
    except Exception:
        pass
    finally:
        loop.close()


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
    """Create a synchronous test client with database override.
    
    Use this for unit tests or simple integration tests.
    """
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


@pytest.fixture(scope="function")
async def async_client(db, event_loop) -> AsyncGenerator[AsyncClient, None]:
    """Create an async test client with database override.
    
    Use this for integration tests that need proper async handling.
    This prevents event loop issues and matches production behavior.
    """
    from app.core.security import get_current_user
    
    async def override_get_db():
        try:
            yield db
        finally:
            pass
    
    # Override database dependency
    app.dependency_overrides[get_db] = override_get_db
    
    # Create async client with proper transport
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as ac:
        yield ac
    
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
def auth_headers(test_user):
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
