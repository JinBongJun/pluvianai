# 테스트 가이드

## 🚀 빠른 시작

### 1. 테스트 환경 설정

```bash
cd backend
pip install -r requirements.txt
pip install -r requirements-test.txt
```

### 2. 테스트 실행

```bash
# 모든 테스트 실행
pytest

# 특정 테스트만 실행
pytest tests/unit/test_cache_service.py

# 커버리지 포함 실행
pytest --cov=app --cov-report=html

# 특정 마커만 실행
pytest -m unit          # Unit tests only
pytest -m integration   # Integration tests only
pytest -m e2e           # E2E tests only
```

## 📁 테스트 구조

```
tests/
├── conftest.py              # 공통 fixtures
├── unit/                    # Unit tests (70%)
│   └── test_cache_service.py
├── integration/             # Integration tests (20%)
│   ├── test_api_auth.py
│   └── test_api_projects.py
└── e2e/                     # E2E tests (10%)
    └── test_user_flows.py
```

## 🧪 테스트 작성 가이드

### Unit Test 예시

```python
# tests/unit/test_quality_evaluator.py
import pytest
from app.services.quality_evaluator import QualityEvaluator

def test_evaluate_valid_response():
    evaluator = QualityEvaluator()
    # Mock API call
    api_call = create_mock_api_call(...)
    
    score = evaluator.evaluate(api_call)
    
    assert score.overall_score >= 0
    assert score.overall_score <= 100
```

### Integration Test 예시

```python
# tests/integration/test_api_projects.py
@pytest.mark.integration
def test_create_project(client, auth_headers):
    response = client.post(
        "/api/v1/projects",
        json={"name": "Test", "description": "Test"},
        headers=auth_headers
    )
    
    assert response.status_code == 201
```

## 📊 커버리지 목표

- **Unit Tests**: 80% 이상
- **Integration Tests**: 60% 이상
- **전체**: 70% 이상

## 🔧 Fixtures 사용

### 기본 Fixtures

- `db`: 테스트용 데이터베이스 세션
- `client`: FastAPI 테스트 클라이언트
- `test_user`: 테스트 사용자
- `auth_headers`: 인증 헤더
- `test_project`: 테스트 프로젝트

### 사용 예시

```python
def test_something(client, auth_headers, test_project):
    response = client.get(
        f"/api/v1/projects/{test_project.id}",
        headers=auth_headers
    )
    assert response.status_code == 200
```

## 🐛 문제 해결

### 테스트 DB 연결 실패

```bash
# 환경 변수 확인
export DATABASE_URL=sqlite:///:memory:
export REDIS_URL=redis://localhost:6379/0
```

### Redis 연결 실패

테스트는 Redis 없이도 실행 가능합니다. `CacheService`가 자동으로 비활성화됩니다.

## 📝 테스트 작성 체크리스트

- [ ] 테스트는 독립적이어야 함 (다른 테스트에 의존하지 않음)
- [ ] 각 테스트 후 데이터 정리
- [ ] 명확한 테스트 이름 사용
- [ ] Arrange-Act-Assert 패턴 사용
- [ ] Edge cases 테스트 포함
- [ ] 에러 케이스 테스트 포함

## 🚀 CI/CD 통합

GitHub Actions에서 자동으로 테스트가 실행됩니다:
- Push to main/develop
- Pull Request 생성

테스트 결과는 Codecov에 업로드됩니다.
