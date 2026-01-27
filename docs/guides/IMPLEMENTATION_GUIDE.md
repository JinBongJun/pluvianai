# 🛠️ AgentGuard 구현 가이드

> **목표**: 환경 변수, 배포, 테스트, SDK 등 구현에 필요한 모든 정보

---

## 📋 목차

1. [환경 변수 설정](#1-환경-변수-설정)
2. [배포 체크리스트](#2-배포-체크리스트)
3. [테스트 전략](#3-테스트-전략)
4. [SDK 배포 및 관리](#4-sdk-배포-및-관리)
5. [CI/CD 파이프라인](#5-cicd-파이프라인)
6. [성능 테스트](#6-성능-테스트)
7. [환경별 설정 관리](#7-환경별-설정-관리)

---

## 1. 환경 변수 설정

### 1.1 필수 환경 변수

**데이터베이스**:
```bash
DATABASE_URL=postgresql://user:password@localhost:5432/agentguard
```

**Redis**:
```bash
REDIS_URL=redis://localhost:6379/0
REDIS_ENABLED=true
```

**JWT**:
```bash
JWT_SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=30
```

**Sentry**:
```bash
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=production
```

**Stripe** (결제):
```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Resend** (이메일 전송):
```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=onboarding@yourdomain.com  # 또는 onboarding@resend.dev (테스트용)
EMAIL_FROM_NAME=AgentGuard
```

**AWS S3** (아카이빙):
```bash
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=agentguard-archives
```

**LLM API Keys**:
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### 1.2 선택적 환경 변수

**로깅**:
```bash
LOG_LEVEL=INFO  # DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_FORMAT=json  # json, text
```

**Rate Limiting**:
```bash
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_HOUR=1000
```

**CORS**:
```bash
CORS_ORIGINS=https://app.agentguard.ai,https://staging.agentguard.ai
```

**기타**:
```bash
API_VERSION=v1
ENVIRONMENT=production  # development, staging, production
DEBUG=false
```

### 1.3 환경 변수 관리

**로컬 개발**:
```bash
# .env 파일 사용
cp .env.example .env
# .env 파일 편집
```

**프로덕션**:
- Railway/Vercel 환경 변수 설정 사용
- 환경 변수는 코드 저장소에 커밋하지 않음
- `.env.example` 파일에 예시만 제공

**Railway 환경 변수 설정**:
1. Railway 대시보드 → 프로젝트 → Variables
2. `RESEND_API_KEY` 추가 (Resend 대시보드에서 발급)
3. `EMAIL_FROM` 추가 (인증된 도메인 또는 `onboarding@resend.dev`)

**Vercel 환경 변수 설정**:
1. Vercel 대시보드 → 프로젝트 → Settings → Environment Variables
2. 프론트엔드에서 이메일 전송이 필요한 경우에만 설정

**환경 변수 검증**:
```python
# backend/app/core/config.py
from pydantic import BaseSettings, validator

class Settings(BaseSettings):
    database_url: str
    redis_url: str
    jwt_secret_key: str
    
    @validator('database_url')
    def validate_database_url(cls, v):
        if not v.startswith('postgresql://'):
            raise ValueError('Invalid database URL')
        return v
    
    class Config:
        env_file = '.env'
        case_sensitive = False

settings = Settings()
```

---

## 2. 배포 체크리스트

### 2.1 배포 전 체크리스트

**코드 품질**:
- [ ] 모든 테스트 통과
- [ ] 코드 리뷰 완료
- [ ] Linter 경고 없음
- [ ] 타입 체크 통과 (mypy)

**데이터베이스**:
- [ ] 마이그레이션 스크립트 준비
- [ ] 마이그레이션 롤백 스크립트 준비
- [ ] 백업 완료

**환경 변수**:
- [ ] 모든 필수 환경 변수 설정
- [ ] 시크릿 키 로테이션 완료 (필요시)
- [ ] 환경 변수 검증 완료

**인프라**:
- [ ] 서버 리소스 확인 (CPU, Memory, Disk)
- [ ] 로드 밸런서 설정 확인
- [ ] 헬스 체크 엔드포인트 확인

**모니터링**:
- [ ] Sentry 통합 확인
- [ ] 로깅 설정 확인
- [ ] 메트릭 수집 설정 확인

### 2.2 배포 프로세스

**Blue-Green 배포**:
1. 새 버전을 Green 환경에 배포
2. 헬스 체크 확인
3. 트래픽을 Green으로 전환
4. Blue 환경 모니터링 (롤백 준비)
5. 문제 없으면 Blue 환경 종료

**카나리 배포**:
1. 새 버전을 소수 인스턴스에 배포
2. 트래픽의 10%를 새 버전으로 라우팅
3. 모니터링 및 메트릭 확인
4. 문제 없으면 점진적으로 트래픽 증가
5. 모든 트래픽 전환 완료

### 2.3 배포 후 체크리스트

**기능 확인**:
- [ ] 주요 엔드포인트 동작 확인
- [ ] 인증/인가 동작 확인
- [ ] 데이터베이스 연결 확인
- [ ] Redis 연결 확인

**성능 확인**:
- [ ] 응답 시간 확인
- [ ] 에러율 확인
- [ ] 리소스 사용량 확인

**모니터링 확인**:
- [ ] 로그 수집 확인
- [ ] 메트릭 수집 확인
- [ ] 알림 설정 확인

---

## 3. 테스트 전략

### 3.1 테스트 피라미드

**단위 테스트 (70%)**:
- 서비스 레이어 로직 테스트
- 유틸리티 함수 테스트
- 도메인 모델 테스트

**통합 테스트 (20%)**:
- API 엔드포인트 테스트
- 데이터베이스 통합 테스트
- 외부 서비스 통합 테스트 (Mock)

**E2E 테스트 (10%)**:
- 주요 사용자 시나리오 테스트
- 전체 워크플로우 테스트

### 3.2 테스트 커버리지 목표

**목표 커버리지**: 80%

**측정 도구**:
- `pytest-cov` (Python)
- `jest --coverage` (TypeScript)

**커버리지 리포트**:
```bash
# Python
pytest --cov=app --cov-report=html

# TypeScript
npm test -- --coverage
```

### 3.3 테스트 자동화

**CI/CD 통합**:
```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v3
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-test.txt
      - name: Run tests
        run: pytest --cov=app --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

**테스트 실행 주기**:
- 커밋 시: 단위 테스트 + 통합 테스트
- PR 시: 전체 테스트 스위트
- 배포 전: 전체 테스트 + E2E 테스트

### 3.4 테스트 데이터 관리

**테스트 데이터 생성**:
```python
# tests/fixtures.py
import factory
from app.models import User, Project

class UserFactory(factory.Factory):
    class Meta:
        model = User
    
    email = factory.Sequence(lambda n: f"user{n}@example.com")
    full_name = factory.Faker('name')
    is_active = True

class ProjectFactory(factory.Factory):
    class Meta:
        model = Project
    
    name = factory.Sequence(lambda n: f"Project {n}")
    owner = factory.SubFactory(UserFactory)
```

**테스트 데이터 격리**:
- 각 테스트는 독립적으로 실행
- 테스트 후 데이터 정리 (teardown)
- 트랜잭션 롤백 활용

---

## 4. SDK 배포 및 관리

### 4.1 Python SDK

**패키지 구조**:
```
agentguard-python/
├── agentguard/
│   ├── __init__.py
│   ├── client.py
│   └── middleware.py
├── setup.py
├── README.md
└── tests/
```

**setup.py**:
```python
from setuptools import setup, find_packages

setup(
    name="agentguard",
    version="1.0.0",
    description="AgentGuard Python SDK",
    author="AgentGuard Team",
    packages=find_packages(),
    install_requires=[
        "requests>=2.28.0",
        "pydantic>=1.10.0",
    ],
    python_requires=">=3.8",
)
```

**PyPI 배포**:
```bash
# 빌드
python setup.py sdist bdist_wheel

# PyPI 업로드
twine upload dist/*
```

**버전 관리**:
- Semantic Versioning (MAJOR.MINOR.PATCH)
- `1.0.0` → `1.0.1` (패치)
- `1.0.0` → `1.1.0` (마이너)
- `1.0.0` → `2.0.0` (메이저)

### 4.2 Node.js SDK

**패키지 구조**:
```
agentguard-node/
├── src/
│   ├── index.ts
│   ├── client.ts
│   └── middleware.ts
├── package.json
├── tsconfig.json
├── README.md
└── tests/
```

**package.json**:
```json
{
  "name": "@agentguard/sdk",
  "version": "1.0.0",
  "description": "AgentGuard Node.js SDK",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "publish": "npm publish --access public"
  },
  "dependencies": {
    "axios": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^18.0.0",
    "typescript": "^5.0.0"
  }
}
```

**npm 배포**:
```bash
# 빌드
npm run build

# npm 배포
npm publish --access public
```

### 4.3 SDK 문서화

**API 문서**:
- 각 함수에 JSDoc/Python Docstring 추가
- 사용 예제 포함
- 타입 힌트/TypeScript 타입 정의

**README.md**:
```markdown
# AgentGuard SDK

## Installation

```bash
pip install agentguard
```

## Quick Start

```python
from agentguard import AgentGuardClient

client = AgentGuardClient(api_key="your-api-key")

# Create a project
project = client.projects.create(
    name="My Project",
    description="Project description"
)
```

## API Reference

See [API Reference](./API_REFERENCE.md)
```

### 4.4 SDK 버전 관리

**하위 호환성 정책**:
- 패치 버전: 버그 수정만 (하위 호환)
- 마이너 버전: 새 기능 추가 (하위 호환)
- 메이저 버전: Breaking Changes

**Deprecation 정책**:
- Deprecated 기능은 최소 2개 버전 동안 유지
- Deprecation Notice 명시
- 마이그레이션 가이드 제공

---

## 5. CI/CD 파이프라인

### 5.1 GitHub Actions 워크플로우

**테스트 워크플로우**:
```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Set up Python
        uses: actions/setup-python@v3
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r requirements.txt
          pip install -r requirements-test.txt
      - name: Run tests
        run: pytest --cov=app
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

**배포 워크플로우**:
```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Railway
        uses: bervProject/railway-deploy@v1
        with:
          railway_token: ${{ secrets.RAILWAY_TOKEN }}
          service: backend
```

### 5.2 배포 파이프라인 단계

1. **코드 체크아웃**
2. **의존성 설치**
3. **테스트 실행**
4. **빌드**
5. **배포**
6. **헬스 체크**
7. **알림**

---

## 6. 성능 테스트

### 6.1 부하 테스트

**도구**: Locust

**테스트 시나리오**:
```python
# locustfile.py
from locust import HttpUser, task, between

class AgentGuardUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        # 로그인
        response = self.client.post("/api/v1/auth/login", json={
            "email": "user@example.com",
            "password": "password123"
        })
        self.token = response.json()["data"]["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    @task(3)
    def list_projects(self):
        self.client.get("/api/v1/projects", headers=self.headers)
    
    @task(1)
    def create_project(self):
        self.client.post("/api/v1/projects", json={
            "name": "Test Project",
            "description": "Test"
        }, headers=self.headers)
```

**실행**:
```bash
locust -f locustfile.py --host=https://api.agentguard.ai
```

### 6.2 스트레스 테스트

**목표**: 시스템 한계 파악

**시나리오**:
- 점진적으로 부하 증가
- 시스템 장애 지점 파악
- 복구 시간 측정

### 6.3 카오스 엔지니어링

**도구**: Chaos Monkey

**시나리오**:
- 서버 종료
- 네트워크 지연
- 데이터베이스 연결 끊김
- Redis 장애

**목표**: 복구 시간 측정 및 개선

### 6.4 성능 벤치마크

**벤치마크 시나리오**:
- PII Sanitization: < 50ms
- Firewall: < 100ms
- Proxy Overhead: < 200ms

**벤치마크 결과 저장**:
- 각 커밋마다 벤치마크 실행
- 결과를 데이터베이스에 저장
- 성능 회귀 감지

---

## 7. 환경별 설정 관리

### 7.1 환경 정의

**개발 환경 (Development)**:
- 로컬 데이터베이스
- 로컬 Redis
- Debug 모드 활성화
- 상세 로깅

**스테이징 환경 (Staging)**:
- 프로덕션과 유사한 인프라
- 테스트 데이터
- 프로덕션 설정 미러링

**프로덕션 환경 (Production)**:
- 프로덕션 데이터베이스
- 프로덕션 Redis
- Debug 모드 비활성화
- 최적화된 로깅

### 7.2 환경별 차이점

**기능 플래그**:
```python
# backend/app/core/config.py
class Settings(BaseSettings):
    environment: str = "development"
    
    @property
    def is_development(self) -> bool:
        return self.environment == "development"
    
    @property
    def is_production(self) -> bool:
        return self.environment == "production"
```

**리소스 크기**:
- 개발: 최소 리소스
- 스테이징: 중간 리소스
- 프로덕션: 최대 리소스

**로그 레벨**:
- 개발: DEBUG
- 스테이징: INFO
- 프로덕션: WARNING

---

**작성일**: 2026-01-XX  
**버전**: 1.0.0  
**참고**: [../DETAILED_DESIGN.md](../DETAILED_DESIGN.md) - 메인 아키텍처 문서
