# Repository 패턴 사용 가이드

## 개요

Repository 패턴은 데이터 접근 계층을 추상화하여 비즈니스 로직과 데이터베이스 구현을 분리합니다.

## 트랜잭션 관리 원칙

### FastAPI 엔드포인트

`save()` 메서드를 사용하면 자동으로 commit됩니다:

```python
from app.core.dependencies import get_project_repository
from app.infrastructure.repositories.project_repository import ProjectRepository

@router.post("/projects")
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    project_repo: ProjectRepository = Depends(get_project_repository),
):
    # save()는 commit하지 않음 - get_db()가 자동 commit
    project = Project(name=project_data.name, owner_id=current_user.id)
    project = project_repo.save(project)
    # get_db()가 함수 종료 시 자동으로 commit
    return project
```

### Background Tasks

`save_and_commit()` 메서드를 사용하여 명시적으로 commit합니다:

```python
from app.core.database import SessionLocal
from app.infrastructure.repositories.api_call_repository import APICallRepository

def background_task():
    db = SessionLocal()
    try:
        repo = APICallRepository(db)
        api_call = APICall(...)
        # Background tasks는 명시적 commit 필요
        api_call = repo.save_and_commit(api_call)
        return api_call.id
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()
```

### 복잡한 트랜잭션

여러 Repository를 사용할 때도 하나의 트랜잭션으로 관리됩니다:

```python
@router.post("/complex")
async def complex_operation(
    project_repo: ProjectRepository = Depends(get_project_repository),
    user_repo: UserRepository = Depends(get_user_repository),
):
    # 여러 Repository 사용
    project = project_repo.save(Project(...))
    user = user_repo.save(User(...))
    
    # get_db()가 전체를 하나의 트랜잭션으로 commit
    # 하나라도 실패하면 전체 rollback
    return {"project": project, "user": user}
```

## 사용 예시

### 기본 CRUD 작업

```python
# Create
project = Project(name="My Project", owner_id=1)
project = project_repo.save(project)

# Read
project = project_repo.find_by_id(1)
projects = project_repo.find_by_user_id(user_id=1)

# Update
project.name = "Updated Name"
project = project_repo.save(project)

# Delete
project_repo.delete(project.id)
```

### 도메인별 쿼리

```python
# ProjectRepository
projects = project_repo.find_by_user_id(user_id=1)
project = project_repo.find_by_name_and_owner("My Project", owner_id=1)

# APICallRepository
api_calls = api_call_repo.find_by_project_id(
    project_id=1,
    provider="openai",
    limit=50
)

# AlertRepository
alerts = alert_repo.find_by_project_id(
    project_id=1,
    alert_type="cost_threshold",
    severity="high"
)
```

### Bulk Operations

```python
# Bulk delete
deleted_count = api_call_repo.bulk_delete(project_id=1)
```

### Relationship Loading

```python
# Eager loading
project = project_repo.find_by_id_with_relationships(
    1,
    relationships=['organization', 'members']
)
```

## 테스트 방법

### Unit Test

```python
def test_find_by_user_id(db_session: Session):
    repo = ProjectRepository(db_session)
    projects = repo.find_by_user_id(user_id=1)
    assert isinstance(projects, list)
```

### Integration Test

```python
@pytest.mark.integration
def test_full_lifecycle(db_session):
    repo = ProjectRepository(db_session)
    
    # Create
    project = Project(name="Test", owner_id=1)
    saved = repo.save_and_commit(project)
    
    # Read
    found = repo.find_by_id(saved.id)
    assert found is not None
    
    # Delete
    repo.delete_and_commit(saved.id)
    assert repo.find_by_id(saved.id) is None
```

## 주의사항

### ⚠️ 중요한 원칙

1. **Repository는 commit하지 않음**: FastAPI 엔드포인트에서는 `save()` 사용, get_db()가 commit 처리
2. **Background tasks는 `save_and_commit()` 사용**: SessionLocal() 직접 사용 시 명시적 commit 필요
3. **세션 생명주기는 get_db()가 관리**: Repository는 세션을 소유하지 않음

### 에러 처리

```python
from app.infrastructure.repositories.exceptions import (
    EntityNotFoundError,
    EntityAlreadyExistsError
)

try:
    project = project_repo.save(project)
except EntityAlreadyExistsError as e:
    raise HTTPException(status_code=409, detail=str(e))
```

## Supabase 전환 시 변경 사항

### 현재 (SQLAlchemy)

```python
from app.infrastructure.repositories.project_repository import ProjectRepository

repo = ProjectRepository(db)
project = repo.find_by_id(1)
```

### Supabase 전환 후

```python
# SupabaseRepository 구현 후
from app.infrastructure.repositories.supabase_project_repository import SupabaseProjectRepository

repo = SupabaseProjectRepository(supabase_client)
project = repo.find_by_id(1)  # 동일한 인터페이스
```

**변경 사항**:
- Repository 구현체만 교체
- BaseRepository 인터페이스는 변경 없음
- 사용하는 코드는 수정 불필요

## 모범 사례

1. **의존성 주입 사용**: `Depends(get_project_repository)` 사용
2. **트랜잭션 관리**: FastAPI 엔드포인트는 `save()`, Background tasks는 `save_and_commit()`
3. **에러 처리**: Repository 예외를 적절히 처리
4. **테스트**: Unit test와 Integration test 작성
5. **점진적 적용**: 기존 코드는 유지하고 새 코드부터 Repository 패턴 사용
