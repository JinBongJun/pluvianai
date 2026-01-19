# 테스트 실행 가이드

## 📋 목차

1. [환경 설정](#환경-설정)
2. [테스트 실행](#테스트-실행)
3. [테스트 작성](#테스트-작성)
4. [문제 해결](#문제-해결)

---

## 환경 설정

### 1. 의존성 설치

```bash
cd backend
pip install -r requirements.txt
pip install -r requirements-test.txt
```

### 2. 환경 변수 설정 (선택사항)

테스트는 기본적으로 in-memory SQLite를 사용하므로 별도 설정이 필요 없습니다.

프로덕션과 유사한 환경에서 테스트하려면:

```bash
export DATABASE_URL=postgresql://user:pass@localhost:5432/test_db
export REDIS_URL=redis://localhost:6379/0
export SECRET_KEY=test-secret-key
```

---

## 테스트 실행

### 기본 실행

```bash
# 모든 테스트 실행
pytest

# Verbose 모드
pytest -v

# 특정 파일만 실행
pytest tests/unit/test_cache_service.py

# 특정 테스트만 실행
pytest tests/unit/test_cache_service.py::TestCacheService::test_get_when_disabled
```

### 마커 사용

```bash
# Unit tests만 실행
pytest -m unit

# Integration tests만 실행
pytest -m integration

# E2E tests만 실행
pytest -m e2e

# Slow tests 제외
pytest -m "not slow"
```

### 커버리지 포함

```bash
# 터미널에 커버리지 출력
pytest --cov=app --cov-report=term

# HTML 리포트 생성
pytest --cov=app --cov-report=html
# 리포트는 htmlcov/index.html에서 확인

# XML 리포트 생성 (CI/CD용)
pytest --cov=app --cov-report=xml
```

### 병렬 실행 (빠른 실행)

```bash
# pytest-xdist 설치 필요
pip install pytest-xdist

# 4개 워커로 병렬 실행
pytest -n 4
```

---

## 테스트 작성

### 1. Unit Test 작성

**위치**: `tests/unit/`

**예시**:

```python
# tests/unit/test_quality_evaluator.py
import pytest
from app.services.quality_evaluator import QualityEvaluator

@pytest.mark.unit
def test_evaluate_valid_response():
    """Test quality evaluation with valid response"""
    evaluator = QualityEvaluator()
    
    # Arrange: Create mock API call
    api_call = create_mock_api_call(
        response_data={"status": "success"}
    )
    
    # Act: Evaluate
    score = evaluator.evaluate(api_call)
    
    # Assert: Check results
    assert score.overall_score >= 0
    assert score.overall_score <= 100
    assert score.response_time_score is not None
```

### 2. Integration Test 작성

**위치**: `tests/integration/`

**예시**:

```python
# tests/integration/test_api_projects.py
import pytest
from fastapi import status

@pytest.mark.integration
def test_create_project_success(client, auth_headers):
    """Test creating a project via API"""
    # Arrange: Prepare request
    project_data = {
        "name": "New Project",
        "description": "Test Description"
    }
    
    # Act: Make request
    response = client.post(
        "/api/v1/projects",
        json=project_data,
        headers=auth_headers
    )
    
    # Assert: Check response
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == project_data["name"]
    assert "id" in data
```

### 3. E2E Test 작성

**위치**: `tests/e2e/`

**예시**:

```python
# tests/e2e/test_user_flow.py
@pytest.mark.e2e
def test_complete_monitoring_flow(client):
    """Test complete user flow from registration to monitoring"""
    # 1. Register user
    register_response = client.post(
        "/api/v1/auth/register",
        json={
            "email": "user@example.com",
            "password": "password123",
            "full_name": "Test User"
        }
    )
    assert register_response.status_code == 201
    
    # 2. Login
    login_response = client.post(
        "/api/v1/auth/login",
        data={
            "username": "user@example.com",
            "password": "password123"
        }
    )
    token = login_response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 3. Create project
    project_response = client.post(
        "/api/v1/projects",
        json={"name": "My Project"},
        headers=headers
    )
    project_id = project_response.json()["id"]
    
    # 4. Record API call
    # ... (continue flow)
```

---

## Fixtures 사용

### 기본 Fixtures (conftest.py에서 제공)

- **`db`**: 테스트용 DB 세션 (각 테스트마다 새로 생성)
- **`client`**: FastAPI TestClient
- **`test_user`**: 테스트 사용자 (자동 생성)
- **`auth_headers`**: 인증 헤더 (test_user용)
- **`test_project`**: 테스트 프로젝트 (test_user 소유)

### 사용 예시

```python
def test_something(client, auth_headers, test_project):
    response = client.get(
        f"/api/v1/projects/{test_project.id}",
        headers=auth_headers
    )
    assert response.status_code == 200
```

### 커스텀 Fixture 생성

```python
# tests/conftest.py에 추가
@pytest.fixture
def test_api_call(db, test_project):
    """Create a test API call"""
    from app.models.api_call import APICall
    
    api_call = APICall(
        project_id=test_project.id,
        provider="openai",
        model="gpt-4",
        request_data={"prompt": "Hello"},
        response_data={"text": "Hi"}
    )
    db.add(api_call)
    db.commit()
    db.refresh(api_call)
    return api_call
```

---

## 문제 해결

### 1. 테스트가 실패하는 경우

```bash
# 상세한 에러 메시지 확인
pytest -v --tb=long

# 특정 테스트만 실행하여 디버깅
pytest tests/integration/test_api_projects.py::test_create_project_success -v
```

### 2. DB 연결 문제

테스트는 기본적으로 in-memory SQLite를 사용하므로 별도 DB가 필요 없습니다.

PostgreSQL을 사용하려면:

```bash
# Docker로 PostgreSQL 실행
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=test postgres:15

# 환경 변수 설정
export DATABASE_URL=postgresql://postgres:test@localhost:5432/test
```

### 3. Redis 연결 문제

Redis가 없어도 테스트는 실행됩니다. `CacheService`가 자동으로 비활성화됩니다.

Redis를 사용하려면:

```bash
# Docker로 Redis 실행
docker run -d -p 6379:6379 redis:7

# 환경 변수 설정
export REDIS_URL=redis://localhost:6379/0
```

### 4. Import 에러

```bash
# PYTHONPATH 설정
export PYTHONPATH="${PYTHONPATH}:$(pwd)/backend"

# 또는 pytest 실행 시
PYTHONPATH=backend pytest
```

---

## 테스트 작성 체크리스트

각 테스트를 작성할 때 다음을 확인하세요:

- [ ] **독립성**: 다른 테스트에 의존하지 않음
- [ ] **명확한 이름**: 테스트가 무엇을 하는지 명확함
- [ ] **AAA 패턴**: Arrange-Act-Assert 구조
- [ ] **Edge cases**: 경계값 테스트 포함
- [ ] **에러 케이스**: 실패 시나리오 테스트
- [ ] **정리**: 테스트 후 데이터 정리 (fixture가 자동 처리)

---

## CI/CD 통합

GitHub Actions에서 자동으로 테스트가 실행됩니다:

- **트리거**: Push to main/develop, Pull Request
- **환경**: Ubuntu Latest, Python 3.11
- **서비스**: PostgreSQL 15, Redis 7
- **리포트**: Codecov에 커버리지 업로드

---

## 다음 단계

1. **더 많은 테스트 작성**
   - 각 API 엔드포인트 테스트
   - 각 Service 클래스 테스트
   - Edge cases 테스트

2. **성능 테스트 추가**
   - Load testing (Locust, k6)
   - Stress testing

3. **보안 테스트 추가**
   - Authentication/Authorization 테스트
   - Input validation 테스트

---

## 참고 자료

- [pytest 문서](https://docs.pytest.org/)
- [FastAPI 테스팅](https://fastapi.tiangolo.com/tutorial/testing/)
- [pytest fixtures](https://docs.pytest.org/en/stable/fixture.html)
