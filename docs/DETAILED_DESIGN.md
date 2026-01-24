# 🏗️ AgentGuard 상세 설계 문서

> **목표**: 처음부터 제대로 설계하여 YC 지원, 페르소나/ICP 고려, 안티패턴 방지, 보안/운영 체크리스트 완료

---

## 📋 목차

1. [비전 & 페르소나](#1-비전--페르소나)
2. [아키텍처 원칙](#2-아키텍처-원칙)
3. [계층 구조 설계](#3-계층-구조-설계)
4. [핵심 기능 정의](#4-핵심-기능-정의)
5. [보안 체크리스트](#5-보안-체크리스트)
6. [운영 필수 요소](#6-운영-필수-요소)
7. [데이터베이스 설계](#7-데이터베이스-설계)
8. [API 설계](#8-api-설계)
9. [프론트엔드 설계](#9-프론트엔드-설계)
10. [마이그레이션 전략](#10-마이그레이션-전략)

---

## 1. 비전 & 페르소나

### 1.1 타겟 페르소나

**"AI Product Engineer"**

- **역할**: AI 에이전트를 제품에 통합하는 엔지니어
- **페인 포인트**: "Silent Regressions" - 모델/프롬프트 변경 시 성능 저하를 감지하기 어려움
- **행동 패턴**: "Vibe-testing" → "Scientific reliability"로 전환 필요
- **도구 경험**: CI/CD, 모니터링 도구 사용 경험

### 1.2 ICP (Ideal Customer Profile)

**초기 (Free → Pro 전환)**
- 개인 개발자/소규모 스타트업
- AI 제품을 만들고 있지만 테스트 방법이 불명확
- 월 1,000개 이하의 snapshot 생성

**성장 (Pro 플랜)**
- AI 제품을 만드는 팀 (5-50명)
- 정기적인 모델/프롬프트 업데이트
- 월 10,000개 이상의 snapshot 생성

**확장 (Enterprise)**
- Enterprise AI 도입 기업
- 다중 프로젝트/조직 관리 필요
- SLA 및 지원 요구사항

### 1.3 핵심 가치 제안

1. **Zero-Friction**: Base URL만 변경하면 즉시 사용 가능
2. **AI-Native**: LLM-as-a-Judge로 의미론적 평가
3. **Safety-First**: Circuit Breaker로 프로덕션 안전성 보장
4. **Switzerland Strategy**: 모든 LLM 프로바이더 중립 지원

---

## 2. 아키텍처 원칙

### 2.1 안티패턴 방지 (이미지 참고)

#### ❌ 금지 사항

1. **컨트롤러가 리포지토리를 직접 사용**
   - 문제: 책임 분리 붕괴, 비즈니스 로직이 컨트롤러에 흩어짐
   - 해결: 컨트롤러 → 서비스 → 리포지토리 계층 분리

2. **서비스가 RequestDTO를 사용**
   - 문제: 도메인 독립성 깨짐, HTTP 인터페이스에 종속
   - 해결: 서비스는 도메인 모델만 사용, DTO는 컨트롤러에서만 사용

#### ✅ 올바른 구조

```
Controller (HTTP Layer)
  ↓ (RequestDTO → Domain Model 변환)
Service (Business Logic Layer)
  ↓ (Domain Model 사용)
Repository (Data Access Layer)
  ↓ (Domain Model 반환)
Database
```

### 2.2 OCP (Open-Closed Principle) 준수

- **확장에는 열림**: 새 Repository/Service 추가 시 기존 코드 수정 불필요
- **수정에는 닫힘**: BaseRepository/BaseService 인터페이스는 변경 없이 유지
- **Strategy 패턴**: DB 구현체(SQLAlchemy → Supabase) 교체 가능

### 2.3 Clean Architecture 계층

```
┌─────────────────────────────────────┐
│   Presentation Layer (API/Web)      │  ← FastAPI Controllers
├─────────────────────────────────────┤
│   Application Layer (Use Cases)     │  ← Services
├─────────────────────────────────────┤
│   Domain Layer (Business Logic)     │  ← Domain Models
├─────────────────────────────────────┤
│   Infrastructure Layer (External)   │  ← Repositories, DB, Redis
└─────────────────────────────────────┘
```

---

## 3. 계층 구조 설계

### 3.1 Controller Layer (HTTP 요청/응답 처리)

**책임**:
- HTTP 요청/응답 처리
- RequestDTO → Domain Model 변환
- ResponseDTO ← Domain Model 변환
- 인증/인가 체크 (의존성 주입)
- 에러 핸들링 (HTTP 상태 코드)

**금지 사항**:
- ❌ 리포지토리 직접 사용
- ❌ 비즈니스 로직 포함
- ❌ 데이터베이스 쿼리 직접 실행

**예시 구조**:
```python
# backend/app/api/v1/endpoints/projects.py

@router.post("", response_model=ProjectResponse)
async def create_project(
    project_data: ProjectCreate,  # RequestDTO
    current_user: User = Depends(get_current_user),
    project_service: ProjectService = Depends(get_project_service)
):
    # RequestDTO → Domain Model 변환
    project = project_service.create_project(
        name=project_data.name,
        description=project_data.description,
        owner_id=current_user.id
    )
    # Domain Model → ResponseDTO 변환 (자동)
    return project
```

### 3.2 Service Layer (비즈니스 로직)

**책임**:
- 비즈니스 로직 구현
- 트랜잭션 경계 관리
- 도메인 모델 조작
- 여러 리포지토리 조합

**금지 사항**:
- ❌ RequestDTO/ResponseDTO 사용
- ❌ HTTP 관련 코드 (Request, Response 객체)
- ❌ 직접적인 DB 쿼리 (리포지토리 사용)

**예시 구조**:
```python
# backend/app/services/project_service.py

class ProjectService:
    def __init__(
        self,
        project_repo: ProjectRepository,
        user_repo: UserRepository,
        db: Session
    ):
        self.project_repo = project_repo
        self.user_repo = user_repo
        self.db = db
    
    def create_project(
        self,
        name: str,  # 도메인 모델 파라미터
        description: str | None,
        owner_id: int
    ) -> Project:  # 도메인 모델 반환
        # 비즈니스 로직
        if self.project_repo.exists_by_name(name, owner_id):
            raise EntityAlreadyExistsError("Project name already exists")
        
        project = Project(
            name=name,
            description=description,
            owner_id=owner_id
        )
        return self.project_repo.save(project)
```

### 3.3 Repository Layer (데이터 접근)

**책임**:
- 데이터베이스 CRUD 작업
- 쿼리 최적화
- 도메인 모델 반환

**금지 사항**:
- ❌ 비즈니스 로직 포함
- ❌ 트랜잭션 관리 (서비스에서 처리)

**예시 구조**:
```python
# backend/app/infrastructure/repositories/project_repository.py

class ProjectRepository(SQLAlchemyRepository[Project]):
    def find_by_name_and_owner(
        self,
        name: str,
        owner_id: int
    ) -> Optional[Project]:
        return self.db.query(Project).filter(
            Project.name == name,
            Project.owner_id == owner_id,
            Project.is_active.is_(True)
        ).first()
    
    def exists_by_name(
        self,
        name: str,
        owner_id: int
    ) -> bool:
        return self.db.query(
            exists().where(
                and_(
                    Project.name == name,
                    Project.owner_id == owner_id,
                    Project.is_active.is_(True)
                )
            )
        ).scalar()
```

### 3.4 Domain Model Layer

**책임**:
- 비즈니스 엔티티 정의
- 도메인 규칙 캡슐화
- 데이터베이스 스키마 정의

**예시 구조**:
```python
# backend/app/models/project.py

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 도메인 로직
    def deactivate(self):
        """프로젝트 비활성화"""
        self.is_active = False
    
    def is_owned_by(self, user_id: int) -> bool:
        """소유자 확인"""
        return self.owner_id == user_id
```

---

## 4. 핵심 기능 정의

### 4.1 MVP 핵심 기능 (필수)

#### 1. Proxy (Zero-Friction Interception)
- **목적**: Base URL만 변경하여 모든 LLM 요청 캡처
- **구현**: FastAPI Proxy 엔드포인트 + 비동기 Snapshot 생성
- **우선순위**: P0

#### 2. Snapshot/Replay
- **목적**: 프로덕션 트래픽을 재실행하여 테스트
- **구현**: Snapshot 저장 → Replay 실행 → 결과 비교
- **우선순위**: P0

#### 3. LLM-as-a-Judge
- **목적**: 의미론적 평가로 Regression 감지
- **구현**: Evaluation Rubrics + GPT-4o-mini Judge
- **우선순위**: P0

#### 4. Panic Mode (Circuit Breaker)
- **목적**: 비상 시 모든 트래픽 즉시 차단
- **구현**: Redis 기반 글로벌 토글
- **우선순위**: P0

#### 5. Projects & Auth
- **목적**: 멀티 테넌시 및 인증
- **구현**: Project 관리 + JWT 인증
- **우선순위**: P0

#### 6. Organizations (기본)
- **목적**: 팀/조직 관리
- **구현**: Organization + Member 관리
- **우선순위**: P1

### 4.2 제거/미루어야 할 기능

#### ❌ 제거 (YC 관점에서 불필요)
- Shadow Routing (복잡함, 나중에)
- Agent Chain Profiler (고급 기능)
- Archive (나중에)
- Admin (나중에)
- Reports (나중에)
- Webhooks (나중에)
- Feature Flags (나중에)
- Monitoring (중복, Alerts로 통합)
- Notifications (Alerts로 통합)
- Export (나중에)
- Activity (나중에)
- Settings (나중에)
- Benchmark (Cost로 통합 가능)

#### ⏸️ 미루기 (Phase 2+)
- Advanced Analytics
- Custom Integrations
- API Rate Limiting (기본은 유지)
- Advanced RBAC

---

## 5. 보안 체크리스트

### 5.1 인증/인가 (AuthN/AuthZ)

#### ✅ 구현 필요
- [x] JWT 기반 인증
- [x] Password Hashing (bcrypt)
- [ ] Refresh Token Rotation
- [ ] API Key 인증 (SDK용)
- [ ] RBAC (Role-Based Access Control)
- [ ] ABAC (Attribute-Based Access Control)
- [ ] 테넌트 격리 (project_id 필수 체크)
- [ ] 최소 권한 원칙

#### 구현 위치
- `backend/app/core/security.py` - JWT, Password
- `backend/app/core/permissions.py` - RBAC, Project Access
- `backend/app/middleware/auth_middleware.py` - 인증 미들웨어

### 5.2 입력 검증 & SQL Injection 방어

#### ✅ 구현 필요
- [x] Pydantic RequestDTO 검증
- [ ] SQL Injection 방어 (SQLAlchemy ORM 사용)
- [ ] XSS 방어 (CSP 헤더)
- [ ] CSRF 방어 (SameSite 쿠키)
- [ ] SSRF 방어 (프록시 요청 검증)

#### 구현 위치
- `backend/app/api/v1/endpoints/*.py` - Pydantic 검증
- `backend/app/core/validation.py` - 커스텀 검증
- `backend/app/middleware/security_middleware.py` - 보안 헤더

### 5.3 Rate Limiting & Brute Force 방어

#### ✅ 구현 필요
- [x] Rate Limiting (기본)
- [ ] Brute Force 방어 (로그인 시도 제한)
- [ ] IP 기반 차단

#### 구현 위치
- `backend/app/middleware/rate_limit.py` - Rate Limiting
- `backend/app/services/brute_force_protection.py` - Brute Force

### 5.4 쿠키 & 세션 보안

#### ✅ 구현 필요
- [ ] HttpOnly 쿠키
- [ ] Secure 쿠키 (HTTPS)
- [ ] SameSite 쿠키
- [ ] 세션 타임아웃

### 5.5 Secret 관리 & Rotation

#### ✅ 구현 필요
- [ ] 환경 변수로 Secret 관리
- [ ] Secret Rotation 전략
- [ ] API Key Rotation

### 5.6 HTTPS/HSTS & 보안 헤더

#### ✅ 구현 필요
- [ ] HTTPS 강제
- [ ] HSTS 헤더
- [ ] CSP (Content Security Policy)
- [ ] X-Frame-Options
- [ ] X-Content-Type-Options
- [ ] Referrer-Policy

### 5.7 CORS/Preflight

#### ✅ 구현 필요
- [x] CORS 설정 (기본)
- [ ] Preflight 요청 처리
- [ ] 프로덕션 환경별 Origin 제한

### 5.8 Audit Log

#### ✅ 구현 필요
- [ ] 모든 인증/인가 이벤트 로깅
- [ ] 중요한 비즈니스 액션 로깅
- [ ] 불변성 보장 (로그 수정 불가)

### 5.9 에러 노출 차단

#### ✅ 구현 필요
- [x] 프로덕션 환경에서 상세 에러 숨김
- [ ] Sentry 통합 (에러 추적)
- [ ] 일반적인 에러 메시지 반환

### 5.10 의존성 취약점 점검

#### ✅ 구현 필요
- [ ] 정기적인 `pip audit` 실행
- [ ] Dependabot 설정
- [ ] 취약점 알림 시스템

---

## 6. 운영 필수 요소

### 6.1 에러 로깅

#### ✅ 구현 필요
- [x] Sentry 통합
- [x] 구조화된 JSON 로깅
- [ ] 에러 알림 (Slack/Email)

### 6.2 사용자 행동/이벤트 추적

#### ✅ 구현 필요
- [ ] PostHog 또는 Google Analytics 통합
- [ ] 주요 이벤트 추적 (Project 생성, Replay 실행 등)

### 6.3 백업 전략

#### ✅ 구현 필요
- [ ] 데이터베이스 자동 백업 (Railway/Supabase)
- [ ] 백업 복구 테스트
- [ ] 백업 보관 정책

### 6.4 Status Page/Health Check

#### ✅ 구현 필요
- [x] `/health` 엔드포인트
- [x] `/health/detailed` 엔드포인트
- [ ] 외부 Status Page (예: statuspage.io)

### 6.5 Admin Screen

#### ✅ 구현 필요
- [ ] 사용자 관리 화면
- [ ] 결제 관리 화면
- [ ] 콘텐츠 관리 화면
- [ ] 시스템 모니터링 화면

---

## 7. 데이터베이스 설계

### 7.1 핵심 테이블

#### Users
- `id`, `email`, `hashed_password`, `full_name`, `is_active`, `created_at`

#### Projects
- `id`, `name`, `description`, `owner_id`, `organization_id`, `is_active`, `created_at`

#### Organizations
- `id`, `name`, `plan_type`, `created_at`

#### OrganizationMembers
- `id`, `organization_id`, `user_id`, `role`, `created_at`

#### Snapshots
- `id`, `project_id`, `trace_id`, `request_data`, `response_data`, `created_at`

#### Traces
- `id`, `project_id`, `name`, `created_at`

#### EvaluationRubrics
- `id`, `project_id`, `name`, `criteria_prompt`, `min_score`, `max_score`, `created_at`

#### APICalls
- `id`, `project_id`, `snapshot_id`, `provider`, `model`, `prompt_tokens`, `completion_tokens`, `cost`, `created_at`

### 7.2 인덱스 전략

```sql
-- 필수 인덱스
CREATE INDEX idx_projects_owner_id ON projects(owner_id);
CREATE INDEX idx_projects_organization_id ON projects(organization_id);
CREATE INDEX idx_snapshots_project_id ON snapshots(project_id);
CREATE INDEX idx_snapshots_trace_id ON snapshots(trace_id);
CREATE INDEX idx_api_calls_project_id ON api_calls(project_id);
CREATE INDEX idx_api_calls_created_at ON api_calls(created_at);
```

### 7.3 마이그레이션 전략

- Alembic 사용
- 모든 스키마 변경은 마이그레이션으로
- 롤백 가능한 마이그레이션 작성

---

## 8. API 설계

### 8.1 RESTful API 원칙

- 리소스 중심 URL 설계
- HTTP 메서드 적절히 사용 (GET, POST, PUT, DELETE)
- 일관된 응답 형식

### 8.2 핵심 엔드포인트

#### Auth
- `POST /api/v1/auth/register` - 회원가입
- `POST /api/v1/auth/login` - 로그인
- `POST /api/v1/auth/refresh` - 토큰 갱신

#### Projects
- `GET /api/v1/projects` - 프로젝트 목록
- `POST /api/v1/projects` - 프로젝트 생성
- `GET /api/v1/projects/{id}` - 프로젝트 조회
- `PUT /api/v1/projects/{id}` - 프로젝트 수정
- `DELETE /api/v1/projects/{id}` - 프로젝트 삭제
- `POST /api/v1/projects/{id}/panic` - Panic Mode 토글

#### Proxy
- `POST /api/v1/proxy/{project_id}/chat/completions` - OpenAI Proxy
- `POST /api/v1/proxy/{project_id}/v1/chat/completions` - Anthropic Proxy

#### Replay
- `POST /api/v1/replay/{project_id}/run` - Replay 실행
- `GET /api/v1/replay/{project_id}/results` - Replay 결과 조회

#### Rubrics
- `GET /api/v1/projects/{id}/rubrics` - 루브릭 목록
- `POST /api/v1/projects/{id}/rubrics` - 루브릭 생성
- `DELETE /api/v1/rubrics/{id}` - 루브릭 삭제

#### Organizations
- `GET /api/v1/organizations` - 조직 목록
- `POST /api/v1/organizations` - 조직 생성
- `GET /api/v1/organizations/{id}` - 조직 조회

### 8.3 응답 형식

```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "per_page": 20,
    "total": 100
  }
}
```

에러 응답:
```json
{
  "error": {
    "code": "PROJECT_NOT_FOUND",
    "message": "Project not found",
    "details": { ... }
  }
}
```

---

## 9. 프론트엔드 설계

### 9.1 기술 스택

- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui (표준 SaaS 컴포넌트)
- **State Management**: React Context + Zustand (필요시)
- **API Client**: tRPC 또는 Fetch API

### 9.2 디자인 원칙

- **다른 서비스 프레임에 맞춤**: Vercel, Linear, Stripe 같은 모던 SaaS UI 패턴
- **기능 중심**: 디자인보다 기능 구현 우선
- **일관성**: shadcn/ui 컴포넌트로 일관된 UI

### 9.3 핵심 페이지

1. **Dashboard** - 프로젝트 목록, 통계
2. **Project Detail** - Snapshot 목록, Replay 실행
3. **Replay Results** - Replay 결과 비교 (Side-by-Side)
4. **Rubrics** - 루브릭 관리
5. **Settings** - 프로젝트 설정, Panic Mode

---

## 10. 마이그레이션 전략

### 10.1 단계별 마이그레이션

#### Phase 1: 인프라 구조 정리 (1주)
1. Repository 패턴 완전 구현
2. Service Layer 리팩토링 (DTO 제거)
3. Controller Layer 리팩토링 (Repository 직접 사용 제거)

#### Phase 2: 불필요한 기능 제거 (3일)
1. Shadow Routing 제거
2. Agent Chain Profiler 제거
3. Archive/Admin/Reports 등 제거

#### Phase 3: 보안 강화 (1주)
1. 보안 체크리스트 항목 구현
2. 테스트 및 검증

#### Phase 4: 운영 요소 추가 (1주)
1. PostHog 통합
2. Admin Screen 구현
3. 백업 전략 수립

### 10.2 코드 정리 원칙

1. **쓸모있는 코드**: 남기기
   - 핵심 기능 (Proxy, Replay, Judge, Panic Mode)
   - 인증/인가
   - 기본 모니터링

2. **오류 가능성 있는 코드**: 제거
   - 복잡한 비즈니스 로직 (나중에 다시 구현)
   - 사용되지 않는 엔드포인트
   - 중복된 기능

3. **흐름 개선**
   - 명확한 에러 처리
   - 일관된 로깅
   - 트랜잭션 경계 명확화

---

## 📝 메모: 고려사항 저장

### 아키텍처 원칙
- ✅ 컨트롤러 → 서비스 → 리포지토리 계층 분리
- ✅ 서비스는 RequestDTO 사용 금지 (도메인 모델만)
- ✅ OCP 원칙 준수 (확장에는 열림, 수정에는 닫힘)

### 보안 체크리스트
- CORS/Preflight, CSRF, XSS+CSP, SSRF
- AuthN/AuthZ, RBAC/ABAC + 테넌트 격리
- Validation + SQLi 방어
- RateLimit/Bruteforce
- 쿠키 보안, Secret 관리
- HTTPS/HSTS + 보안 헤더
- AuditLog, 에러 노출 차단
- 의존성 취약점 점검

### 운영 필수 요소
- 에러 로깅 (Sentry)
- 사용자 행동 추적 (PostHog/GA)
- 백업 전략
- Status Page/Health Check
- Admin Screen

### 바이브 코딩 초보가 막히는 지점
- 요구사항 변경 시 구조 무너짐 → OCP 준수로 해결
- 로그인/권한 보안 → 보안 체크리스트로 해결
- DB 설계 → 마이그레이션 전략으로 해결
- 배포 복잡도 → Railway/Vercel 사용
- 에러 처리/관측 → Sentry + 구조화된 로깅
- 성능/비용 → 모니터링 및 최적화

---

## 🎯 다음 단계

1. 이 설계 문서 검토 및 승인
2. Phase 1 시작 (인프라 구조 정리)
3. 단계별 구현 및 테스트
4. 보안 체크리스트 점검
5. 운영 요소 추가

---

**작성일**: 2026-01-XX  
**버전**: 1.0.0  
**작성자**: AI Assistant + User
