# AgentGuard 서비스 전체 문서

이 문서는 AgentGuard 서비스의 모든 세부 사항을 정리한 완전한 문서입니다. Gemini에게 디자인 개선을 요청하기 전에 서비스의 모든 부분을 이해할 수 있도록 작성되었습니다.

---

## 📋 목차

1. [서비스 개요](#1-서비스-개요)
2. [기술 스택](#2-기술-스택)
3. [아키텍처](#3-아키텍처)
4. [데이터베이스 스키마](#4-데이터베이스-스키마)
5. [API 엔드포인트 전체 목록](#5-api-엔드포인트-전체-목록)
6. [프론트엔드 구조](#6-프론트엔드-구조)
7. [UI/UX 구조](#7-uiux-구조)
8. [구독 플랜 및 기능](#8-구독-플랜-및-기능)
9. [사용자 플로우](#9-사용자-플로우)
10. [데이터 플로우](#10-데이터-플로우)
11. [배포 정보](#11-배포-정보)
12. [환경 변수](#12-환경-변수)
13. [보안 및 인증](#13-보안-및-인증)
14. [성능 최적화](#14-성능-최적화)

---

## 1. 서비스 개요

### 1.1 서비스 목적
AgentGuard는 LLM(Large Language Model) 에이전트의 품질, 비용, 드리프트를 모니터링하는 SaaS 플랫폼입니다.

### 1.2 핵심 기능
- **API 호출 모니터링**: LLM API 호출을 자동으로 캡처하고 분석
- **품질 평가**: LLM 응답의 품질을 자동으로 평가 (JSON 유효성, 구조, 의미 일관성 등)
- **드리프트 감지**: LLM 출력의 변화를 감지하고 알림
- **비용 분석**: API 호출 비용을 추적하고 분석
- **알림 시스템**: 중요한 이벤트 발생 시 알림 전송
- **벤치마크**: 여러 모델을 비교하고 최적 모델 추천
- **에이전트 체인 프로파일링**: 다중 에이전트 파이프라인 분석

### 1.3 타겟 사용자
- LLM 기반 애플리케이션 개발자
- AI 에이전트를 운영하는 스타트업
- LLM 비용을 관리해야 하는 기업
- LLM 품질을 모니터링해야 하는 팀

---

## 2. 기술 스택

### 2.1 백엔드
- **프레임워크**: FastAPI (Python 3.11+)
- **데이터베이스**: PostgreSQL 15+ (JSONB 지원)
- **캐싱**: Redis 7+ (선택사항)
- **인증**: JWT (JSON Web Tokens)
- **비밀번호 해싱**: bcrypt
- **HTTP 클라이언트**: httpx (비동기)
- **ORM**: SQLAlchemy 2.0
- **데이터 검증**: Pydantic v2
- **마이그레이션**: Alembic

### 2.2 프론트엔드
- **프레임워크**: Next.js 14 (App Router)
- **언어**: TypeScript 5.3+
- **스타일링**: Tailwind CSS 3.3+
- **UI 컴포넌트**: 커스텀 컴포넌트 (lucide-react 아이콘)
- **차트**: Recharts 2.10+
- **HTTP 클라이언트**: Axios 1.6+
- **상태 관리**: React Hooks (useState, useEffect)
- **폰트**: Inter (Google Fonts)

### 2.3 인프라
- **프론트엔드 호스팅**: Vercel
- **백엔드 호스팅**: Railway
- **데이터베이스**: Railway PostgreSQL
- **CI/CD**: GitHub Actions
- **버전 관리**: Git (GitHub)

### 2.4 SDK
- **Python SDK**: (구현 예정)
- **Node.js SDK**: (구현 예정)

---

## 3. 아키텍처

### 3.1 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        사용자 브라우저                        │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel (프론트엔드)                       │
│  - Next.js 14 (App Router)                                  │
│  - 정적 파일 서빙                                            │
│  - Edge Functions                                            │
│  - 글로벌 CDN                                                │
└───────────────────────┬─────────────────────────────────────┘
                        │ API 호출
                        │ (HTTPS)
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  Railway (백엔드)                            │
│  - FastAPI 애플리케이션                                      │
│  - uvicorn ASGI 서버                                         │
│  - 포트: $PORT (Railway 자동 할당)                          │
└───────┬───────────────────────────────────┬─────────────────┘
        │                                   │
        ▼                                   ▼
┌──────────────────┐              ┌──────────────────┐
│  PostgreSQL      │              │  Redis           │
│  (Railway)       │              │  (Railway, 선택)  │
│  - 메인 DB       │              │  - 캐싱          │
│  - JSONB 지원    │              │  - 세션          │
└──────────────────┘              └──────────────────┘
```

### 3.2 데이터 플로우

1. **LLM API 호출 캡처**:
   ```
   사용자 애플리케이션 → AgentGuard 프록시 → LLM 제공자 API
                      ↓
                  AgentGuard DB
   ```

2. **프론트엔드 데이터 요청**:
   ```
   브라우저 → Vercel → Railway API → PostgreSQL → Railway API → Vercel → 브라우저
   ```

### 3.3 미들웨어 스택 (백엔드)

1. **LoggingMiddleware**: 모든 요청 로깅
2. **CORSMiddleware**: CORS 처리 (모든 origin 허용)
3. **GZipMiddleware**: 응답 압축
4. **RateLimitMiddleware**: 요청 제한 (60 req/min)
5. **APIHookMiddleware**: LLM API 호출 캡처

---

## 4. 데이터베이스 스키마

### 4.1 모델 관계도

```
User (사용자)
  ├── projects (1:N) → Project
  ├── project_members (1:N) → ProjectMember
  ├── api_keys (1:N) → APIKey
  ├── subscription (1:1) → Subscription
  └── usage (1:N) → Usage

Project (프로젝트)
  ├── owner (N:1) → User
  ├── members (1:N) → ProjectMember
  ├── api_calls (1:N) → APICall
  ├── quality_scores (1:N) → QualityScore
  ├── drift_detections (1:N) → DriftDetection
  ├── alerts (1:N) → Alert
  └── webhooks (1:N) → Webhook

APICall (API 호출)
  ├── project (N:1) → Project
  └── quality_scores (1:N) → QualityScore

QualityScore (품질 점수)
  ├── api_call (N:1) → APICall
  └── project (N:1) → Project

DriftDetection (드리프트 감지)
  └── project (N:1) → Project

Alert (알림)
  ├── project (N:1) → Project
  └── resolved_by (N:1) → User (nullable)

ProjectMember (프로젝트 멤버)
  ├── project (N:1) → Project
  └── user (N:1) → User

APIKey (API 키)
  └── user (N:1) → User

Subscription (구독)
  └── user (1:1) → User

Usage (사용량)
  └── user (N:1) → User

Webhook (웹훅)
  └── project (N:1) → Project (nullable)

ActivityLog (활동 로그)
  └── user (N:1) → User (nullable)
```

### 4.2 주요 모델 상세

#### User (사용자)
- `id`: Integer (PK)
- `email`: String(255), unique, indexed
- `hashed_password`: String(255)
- `full_name`: String(255), nullable
- `is_active`: Boolean, default=True
- `is_superuser`: Boolean, default=False
- `created_at`: DateTime
- `updated_at`: DateTime

#### Project (프로젝트)
- `id`: Integer (PK)
- `name`: String(255)
- `description`: Text, nullable
- `owner_id`: Integer (FK → users.id)
- `is_active`: Boolean, default=True
- `created_at`: DateTime
- `updated_at`: DateTime

#### APICall (API 호출)
- `id`: Integer (PK)
- `project_id`: Integer (FK → projects.id), indexed
- `provider`: String(50), indexed (openai, anthropic, google)
- `model`: String(100), indexed
- `request_data`: JSON (전체 요청 페이로드)
- `request_prompt`: Text, nullable (추출된 프롬프트)
- `request_tokens`: Integer, nullable
- `response_data`: JSON (전체 응답 페이로드)
- `response_text`: Text, nullable (추출된 응답 텍스트)
- `response_tokens`: Integer, nullable
- `latency_ms`: Float, nullable
- `status_code`: Integer, nullable
- `error_message`: Text, nullable
- `agent_name`: String(100), nullable, indexed
- `chain_id`: String(255), nullable, indexed
- `created_at`: DateTime, indexed

#### QualityScore (품질 점수)
- `id`: Integer (PK)
- `api_call_id`: Integer (FK → api_calls.id)
- `project_id`: Integer (FK → projects.id)
- `overall_score`: Float (0-100)
- `semantic_consistency_score`: Float, nullable
- `tone_score`: Float, nullable
- `coherence_score`: Float, nullable
- `json_valid`: Boolean, nullable
- `required_fields_present`: Boolean, nullable
- `created_at`: DateTime

#### DriftDetection (드리프트 감지)
- `id`: Integer (PK)
- `project_id`: Integer (FK → projects.id), indexed
- `detection_type`: String(50), indexed (length, structure, semantic, style, latency)
- `model`: String(100), nullable, indexed
- `agent_name`: String(100), nullable, indexed
- `current_value`: Float, nullable
- `baseline_value`: Float, nullable
- `change_percentage`: Float
- `drift_score`: Float (0-100)
- `detection_details`: JSON, nullable
- `affected_fields`: JSON, nullable
- `severity`: String(20), default="medium" (low, medium, high, critical)
- `detected_at`: DateTime, indexed
- `baseline_period_start`: DateTime, nullable
- `baseline_period_end`: DateTime, nullable

#### Alert (알림)
- `id`: Integer (PK)
- `project_id`: Integer (FK → projects.id), indexed
- `alert_type`: String(50), indexed (drift, cost_spike, error, timeout, model_update)
- `severity`: String(20), default="medium" (low, medium, high, critical)
- `title`: String(255)
- `message`: Text
- `alert_data`: JSON, nullable
- `is_sent`: Boolean, default=False
- `sent_at`: DateTime, nullable
- `notification_channels`: JSON, nullable (["slack", "email", "discord"])
- `is_resolved`: Boolean, default=False
- `resolved_at`: DateTime, nullable
- `resolved_by`: Integer (FK → users.id), nullable
- `created_at`: DateTime, indexed

#### Subscription (구독)
- `id`: Integer (PK)
- `user_id`: Integer (FK → users.id), unique, indexed
- `plan_type`: String(20), default="free" (free, indie, startup, pro, enterprise)
- `status`: String(20), default="active" (active, cancelled, expired, trialing)
- `current_period_start`: DateTime
- `current_period_end`: DateTime
- `cancel_at_period_end`: String(5), default="false"
- `trial_end`: DateTime, nullable
- `paddle_subscription_id`: String(255), nullable, unique, indexed
- `paddle_customer_id`: String(255), nullable, indexed
- `price_per_month`: Float, nullable
- `created_at`: DateTime
- `updated_at`: DateTime

#### Usage (사용량)
- `id`: Integer (PK)
- `user_id`: Integer (FK → users.id), indexed
- `project_id`: Integer (FK → projects.id), nullable, indexed
- `metric_type`: String(50), indexed (api_calls, projects, team_members)
- `count`: Integer
- `period_start`: DateTime
- `period_end`: DateTime
- `created_at`: DateTime

#### ProjectMember (프로젝트 멤버)
- `id`: Integer (PK)
- `project_id`: Integer (FK → projects.id), indexed
- `user_id`: Integer (FK → users.id), indexed
- `role`: String(20) (owner, admin, member, viewer)
- `created_at`: DateTime

#### APIKey (API 키)
- `id`: Integer (PK)
- `user_id`: Integer (FK → users.id), indexed
- `name`: String(100), nullable
- `key_hash`: String(255) (해시된 키)
- `last_used_at`: DateTime, nullable
- `created_at`: DateTime

#### Webhook (웹훅)
- `id`: Integer (PK)
- `project_id`: Integer (FK → projects.id), nullable, indexed
- `name`: String(255)
- `url`: String(500)
- `events`: JSON (이벤트 목록)
- `secret`: String(255), nullable
- `is_active`: Boolean, default=True
- `last_triggered_at`: DateTime, nullable
- `created_at`: DateTime

#### ActivityLog (활동 로그)
- `id`: Integer (PK)
- `user_id`: Integer (FK → users.id), nullable, indexed
- `action`: String(100), indexed
- `resource_type`: String(50), nullable
- `resource_id`: Integer, nullable
- `details`: JSON, nullable
- `ip_address`: String(45), nullable
- `user_agent`: String(500), nullable
- `created_at`: DateTime, indexed

---

## 5. API 엔드포인트 전체 목록

### 5.1 인증 API (`/api/v1/auth`)

#### POST `/auth/register`
- **설명**: 사용자 회원가입
- **요청 본문**: `{ email, password, full_name? }`
- **응답**: `UserResponse`
- **인증**: 불필요

#### POST `/auth/login`
- **설명**: 사용자 로그인 (OAuth2 Password Flow)
- **요청**: FormData (`username`, `password`)
- **응답**: `{ access_token, refresh_token, token_type }`
- **인증**: 불필요

#### POST `/auth/refresh`
- **설명**: 액세스 토큰 갱신
- **요청 본문**: `{ refresh_token }`
- **응답**: `{ access_token, refresh_token, token_type }`
- **인증**: 불필요

#### GET `/auth/me`
- **설명**: 현재 사용자 정보 조회
- **응답**: `UserResponse`
- **인증**: 필요

### 5.2 프로젝트 API (`/api/v1/projects`)

#### POST `/projects`
- **설명**: 프로젝트 생성
- **요청 본문**: `{ name, description? }`
- **응답**: `ProjectResponse`
- **인증**: 필요

#### GET `/projects`
- **설명**: 프로젝트 목록 조회
- **쿼리 파라미터**: `search?` (검색어)
- **응답**: `List[ProjectResponse]`
- **인증**: 필요

#### GET `/projects/{project_id}`
- **설명**: 프로젝트 상세 조회
- **응답**: `ProjectResponse`
- **인증**: 필요, 프로젝트 접근 권한 필요

#### PATCH `/projects/{project_id}`
- **설명**: 프로젝트 수정
- **요청 본문**: `{ name?, description? }`
- **응답**: `ProjectResponse`
- **인증**: 필요, Owner/Admin 권한 필요

#### DELETE `/projects/{project_id}`
- **설명**: 프로젝트 삭제
- **응답**: 204 No Content
- **인증**: 필요, Owner 권한 필요

### 5.3 프로젝트 멤버 API (`/api/v1/projects/{project_id}/members`)

#### POST `/projects/{project_id}/members`
- **설명**: 프로젝트 멤버 추가
- **요청 본문**: `{ user_email, role }`
- **응답**: `ProjectMemberResponse`
- **인증**: 필요, Owner/Admin 권한 필요

#### GET `/projects/{project_id}/members`
- **설명**: 프로젝트 멤버 목록 조회
- **응답**: `List[ProjectMemberResponse]`
- **인증**: 필요, 프로젝트 접근 권한 필요

#### PATCH `/projects/{project_id}/members/{user_id}`
- **설명**: 프로젝트 멤버 역할 변경
- **요청 본문**: `{ role }`
- **응답**: `ProjectMemberResponse`
- **인증**: 필요, Owner/Admin 권한 필요

#### DELETE `/projects/{project_id}/members/{user_id}`
- **설명**: 프로젝트 멤버 제거
- **응답**: 204 No Content
- **인증**: 필요, Owner/Admin 권한 필요

### 5.4 API 호출 API (`/api/v1/api-calls`)

#### GET `/api-calls`
- **설명**: API 호출 목록 조회
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `limit?` (기본값: 100, 최대: 1000)
  - `offset?` (기본값: 0)
  - `provider?` (openai, anthropic, google)
  - `model?`
  - `agent_name?`
- **응답**: `List[APICallResponse]`
- **인증**: 필요, 프로젝트 접근 권한 필요

#### GET `/api-calls/{api_call_id}`
- **설명**: API 호출 상세 조회
- **응답**: `APICallDetailResponse` (request_data, response_data 포함)
- **인증**: 필요, 프로젝트 접근 권한 필요

#### GET `/api-calls/stats`
- **설명**: API 호출 통계 조회
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `days?` (기본값: 7, 범위: 1-30)
- **응답**: `APICallStatsResponse` (total_calls, successful_calls, failed_calls, success_rate, period_start, period_end)
- **인증**: 필요, 프로젝트 접근 권한 필요

### 5.5 품질 평가 API (`/api/v1/quality`)

#### POST `/quality/evaluate`
- **설명**: API 호출 품질 평가
- **쿼리 파라미터**: `project_id` (필수)
- **요청 본문**: `{ api_call_ids?, expected_schema?, required_fields? }`
- **응답**: `List[QualityScoreResponse]`
- **인증**: 필요, 프로젝트 접근 권한 필요

#### GET `/quality/scores`
- **설명**: 품질 점수 목록 조회
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `limit?` (기본값: 100)
  - `offset?` (기본값: 0)
- **응답**: `List[QualityScoreResponse]`
- **인증**: 필요, 프로젝트 접근 권한 필요

#### GET `/quality/stats`
- **설명**: 품질 통계 조회
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `days?` (기본값: 7, 범위: 1-30)
- **응답**: `QualityStatsResponse` (average_score, min_score, max_score, total_evaluations, period_start, period_end)
- **인증**: 필요, 프로젝트 접근 권한 필요

### 5.6 드리프트 감지 API (`/api/v1/drift`)

#### POST `/drift/detect`
- **설명**: 드리프트 감지 실행
- **쿼리 파라미터**: `project_id` (필수)
- **요청 본문**: `{ detection_types?, model?, agent_name? }`
- **응답**: `List[DriftDetectionResponse]`
- **인증**: 필요, 프로젝트 접근 권한 필요

#### GET `/drift`
- **설명**: 드리프트 감지 결과 목록 조회
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `limit?` (기본값: 100, 최대: 1000)
  - `offset?` (기본값: 0)
  - `detection_type?`
  - `severity?`
- **응답**: `List[DriftDetectionResponse]`
- **인증**: 필요, 프로젝트 접근 권한 필요

#### GET `/drift/{detection_id}`
- **설명**: 드리프트 감지 결과 상세 조회
- **응답**: `DriftDetectionResponse`
- **인증**: 필요, 프로젝트 접근 권한 필요

### 5.7 알림 API (`/api/v1/alerts`)

#### GET `/alerts`
- **설명**: 알림 목록 조회
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `limit?` (기본값: 100, 최대: 1000)
  - `offset?` (기본값: 0)
  - `alert_type?`
  - `severity?`
  - `is_resolved?`
- **응답**: `List[AlertResponse]`
- **인증**: 필요, 프로젝트 접근 권한 필요

#### GET `/alerts/{alert_id}`
- **설명**: 알림 상세 조회
- **응답**: `AlertResponse`
- **인증**: 필요, 프로젝트 접근 권한 필요

#### POST `/alerts/{alert_id}/send`
- **설명**: 알림 전송
- **요청 본문**: `{ channels? }` (채널 목록)
- **응답**: 알림 전송 결과
- **인증**: 필요, 프로젝트 접근 권한 필요

#### POST `/alerts/{alert_id}/resolve`
- **설명**: 알림 해결 처리
- **응답**: `AlertResponse`
- **인증**: 필요, 프로젝트 접근 권한 필요

### 5.8 비용 분석 API (`/api/v1/cost`)

#### GET `/cost/analysis`
- **설명**: 비용 분석 조회
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `days?` (기본값: 7, 범위: 1-30)
- **응답**: `CostAnalysisResponse` (total_cost, by_model, by_provider, by_day, average_daily_cost, period_start, period_end)
- **인증**: 필요, 프로젝트 접근 권한 필요

#### POST `/cost/detect-anomalies`
- **설명**: 비용 이상 징후 감지
- **쿼리 파라미터**: `project_id` (필수)
- **응답**: `{ alerts_created, alerts }`
- **인증**: 필요, 프로젝트 접근 권한 필요

#### GET `/cost/compare-models`
- **설명**: 모델별 비용 비교
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `days?` (기본값: 7, 범위: 1-30)
- **응답**: `List[ModelComparisonResponse]`
- **인증**: 필요, 프로젝트 접근 권한 필요

### 5.9 벤치마크 API (`/api/v1/benchmark`)

#### GET `/benchmark/compare`
- **설명**: 모델 비교
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `days?` (기본값: 7)
- **응답**: `List[ModelComparisonResponse]`
- **인증**: 필요, 프로젝트 접근 권한 필요

#### GET `/benchmark/recommendations`
- **설명**: 모델 추천
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `days?` (기본값: 7)
- **응답**: `RecommendationResponse`
- **인증**: 필요, 프로젝트 접근 권한 필요

### 5.10 에이전트 체인 API (`/api/v1/agent-chain`)

#### GET `/agent-chain/profile`
- **설명**: 에이전트 체인 프로파일링
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `chain_id?` (특정 체인 ID)
  - `days?` (기본값: 7, 범위: 1-30)
- **응답**: 에이전트 체인 프로파일 데이터
- **인증**: 필요, 프로젝트 접근 권한 필요, Pro 플랜 이상 필요

#### GET `/agent-chain/agents`
- **설명**: 에이전트 목록 조회
- **쿼리 파라미터**: `project_id` (필수)
- **응답**: 에이전트 목록
- **인증**: 필요, 프로젝트 접근 권한 필요

### 5.11 프록시 API (`/api/v1/proxy`)

#### `/{provider}/{path:path}` (GET, POST, PUT, DELETE, PATCH)
- **설명**: LLM API 프록시 (OpenAI, Anthropic, Google)
- **헤더**: 
  - `X-Project-ID` (필수)
  - `X-Agent-Name?` (에이전트 이름)
  - `X-Chain-ID?` (체인 ID)
- **응답**: LLM 제공자 응답
- **인증**: 필요 (API 키 또는 JWT)

### 5.12 구독 API (`/api/v1/subscription`)

#### GET `/subscription`
- **설명**: 현재 구독 정보 조회
- **응답**: `SubscriptionResponse`
- **인증**: 필요

#### GET `/subscription/plans`
- **설명**: 구독 플랜 목록 조회
- **응답**: `List[PlanResponse]`
- **인증**: 필요

#### POST `/subscription/upgrade`
- **설명**: 구독 업그레이드
- **요청 본문**: `{ plan_type }`
- **응답**: 업그레이드 결과
- **인증**: 필요

#### POST `/subscription/cancel`
- **설명**: 구독 취소
- **응답**: 취소 결과
- **인증**: 필요

#### POST `/subscription/webhooks/paddle`
- **설명**: Paddle 웹훅 처리
- **요청**: Paddle 웹훅 페이로드
- **응답**: 처리 결과
- **인증**: Paddle 서명 검증

### 5.13 설정 API (`/api/v1/settings`)

#### GET `/settings/profile`
- **설명**: 사용자 프로필 조회
- **응답**: `ProfileResponse`
- **인증**: 필요

#### PATCH `/settings/profile`
- **설명**: 사용자 프로필 수정
- **요청 본문**: `{ full_name?, email? }`
- **응답**: `ProfileResponse`
- **인증**: 필요

#### DELETE `/settings/profile`
- **설명**: 계정 삭제
- **쿼리 파라미터**: `password` (필수)
- **응답**: 204 No Content
- **인증**: 필요

#### PATCH `/settings/password`
- **설명**: 비밀번호 변경
- **요청 본문**: `{ current_password, new_password }`
- **응답**: 204 No Content
- **인증**: 필요

#### GET `/settings/api-keys`
- **설명**: API 키 목록 조회
- **응답**: `List[APIKeyResponse]`
- **인증**: 필요

#### POST `/settings/api-keys`
- **설명**: API 키 생성
- **요청 본문**: `{ name? }`
- **응답**: `APIKeyCreateResponse` (키는 이때만 표시)
- **인증**: 필요

#### DELETE `/settings/api-keys/{key_id}`
- **설명**: API 키 삭제
- **응답**: 204 No Content
- **인증**: 필요

#### PATCH `/settings/api-keys/{key_id}`
- **설명**: API 키 이름 수정
- **요청 본문**: `{ name }`
- **응답**: `APIKeyResponse`
- **인증**: 필요

#### GET `/settings/notifications`
- **설명**: 알림 설정 조회
- **응답**: `NotificationSettingsResponse`
- **인증**: 필요

#### PATCH `/settings/notifications`
- **설명**: 알림 설정 수정
- **요청 본문**: `{ email_enabled?, in_app_enabled?, slack_webhook?, discord_webhook? }`
- **응답**: `NotificationSettingsResponse`
- **인증**: 필요

### 5.14 알림 센터 API (`/api/v1/notifications`)

#### GET `/notifications`
- **설명**: 인앱 알림 목록 조회
- **쿼리 파라미터**: 
  - `limit?` (기본값: 50)
  - `offset?` (기본값: 0)
  - `unread_only?` (기본값: false)
- **응답**: `List[NotificationResponse]`
- **인증**: 필요

#### PATCH `/notifications/{alert_id}/read`
- **설명**: 알림 읽음 처리
- **응답**: 204 No Content
- **인증**: 필요

#### DELETE `/notifications/{alert_id}`
- **설명**: 알림 삭제
- **응답**: 204 No Content
- **인증**: 필요

#### GET `/notifications/unread-count`
- **설명**: 읽지 않은 알림 개수 조회
- **응답**: `{ count }`
- **인증**: 필요

### 5.15 웹훅 API (`/api/v1/webhooks`)

#### POST `/webhooks`
- **설명**: 웹훅 생성
- **요청 본문**: `{ name, url, project_id?, events, secret? }`
- **응답**: `WebhookResponse`
- **인증**: 필요

#### GET `/webhooks`
- **설명**: 웹훅 목록 조회
- **쿼리 파라미터**: `project_id?`
- **응답**: `List[WebhookResponse]`
- **인증**: 필요

#### GET `/webhooks/{webhook_id}`
- **설명**: 웹훅 상세 조회
- **응답**: `WebhookResponse`
- **인증**: 필요

#### PATCH `/webhooks/{webhook_id}`
- **설명**: 웹훅 수정
- **요청 본문**: `{ name?, url?, events?, secret?, is_active? }`
- **응답**: `WebhookResponse`
- **인증**: 필요

#### DELETE `/webhooks/{webhook_id}`
- **설명**: 웹훅 삭제
- **응답**: 204 No Content
- **인증**: 필요

#### POST `/webhooks/{webhook_id}/test`
- **설명**: 웹훅 테스트
- **응답**: 테스트 결과
- **인증**: 필요

### 5.16 리포트 API (`/api/v1/reports`)

#### POST `/reports/generate`
- **설명**: 리포트 생성
- **쿼리 파라미터**: `project_id` (필수)
- **요청 본문**: `{ report_type?, date_range?, include_charts? }`
- **응답**: 리포트 생성 결과
- **인증**: 필요, 프로젝트 접근 권한 필요

#### GET `/reports/download`
- **설명**: 리포트 다운로드
- **쿼리 파라미터**: `report_id` (필수)
- **응답**: PDF 또는 JSON 파일
- **인증**: 필요, 프로젝트 접근 권한 필요

### 5.17 내보내기 API (`/api/v1/export`)

#### GET `/export/csv`
- **설명**: 데이터 CSV 내보내기
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `data_type` (api_calls, quality_scores, drift_detections, alerts)
  - `date_from?`
  - `date_to?`
- **응답**: CSV 파일
- **인증**: 필요, 프로젝트 접근 권한 필요

#### GET `/export/json`
- **설명**: 데이터 JSON 내보내기
- **쿼리 파라미터**: 
  - `project_id` (필수)
  - `data_type` (api_calls, quality_scores, drift_detections, alerts)
  - `date_from?`
  - `date_to?`
- **응답**: JSON 파일
- **인증**: 필요, 프로젝트 접근 권한 필요

### 5.18 활동 로그 API (`/api/v1/activity`)

#### GET `/activity`
- **설명**: 활동 로그 조회
- **쿼리 파라미터**: 
  - `limit?` (기본값: 100)
  - `offset?` (기본값: 0)
  - `action?`
  - `resource_type?`
  - `date_from?`
  - `date_to?`
- **응답**: `List[ActivityLogResponse]`
- **인증**: 필요

### 5.19 아카이빙 API (`/api/v1/archive`)

#### POST `/archive/archive`
- **설명**: 오래된 데이터 아카이빙
- **쿼리 파라미터**: `project_id?` (선택, 없으면 전체)
- **응답**: 아카이빙 결과
- **인증**: 필요, Admin 권한 필요

#### GET `/archive/stats`
- **설명**: 아카이빙 통계 조회
- **쿼리 파라미터**: `project_id?` (선택)
- **응답**: 아카이빙 통계
- **인증**: 필요

### 5.20 관리자 API (`/api/v1/admin`)

#### POST `/admin/init-db`
- **설명**: 데이터베이스 초기화 (개발용)
- **응답**: 초기화 결과
- **인증**: 필요, Superuser 권한 필요

#### POST `/admin/generate-sample-data`
- **설명**: 샘플 데이터 생성 (개발/테스트용)
- **쿼리 파라미터**: `project_id?` (선택)
- **응답**: 샘플 데이터 생성 결과
- **인증**: 필요, Superuser 권한 필요

---

## 6. 프론트엔드 구조

### 6.1 페이지 구조 (Next.js App Router)

```
app/
├── page.tsx                    # 루트 페이지 (리다이렉트)
├── layout.tsx                  # 루트 레이아웃
├── globals.css                 # 전역 스타일
├── login/
│   └── page.tsx               # 로그인/회원가입 페이지
├── onboarding/
│   └── page.tsx               # 온보딩 페이지
├── dashboard/
│   ├── page.tsx               # 프로젝트 목록 대시보드
│   └── [projectId]/
│       ├── page.tsx           # 프로젝트 상세 페이지 (Overview)
│       ├── api-calls/
│       │   ├── page.tsx       # API 호출 목록
│       │   └── [callId]/
│       │       └── page.tsx   # API 호출 상세
│       ├── drift/
│       │   ├── page.tsx       # 드리프트 목록 (없을 수 있음)
│       │   └── [driftId]/
│       │       └── page.tsx   # 드리프트 상세
│       ├── alerts/
│       │   └── [alertId]/
│       │       └── page.tsx   # 알림 상세
│       ├── compare/
│       │   └── page.tsx       # 모델 비교 페이지
│       └── reports/
│           └── page.tsx       # 리포트 페이지
└── settings/
    ├── page.tsx               # 설정 메인 페이지
    ├── profile/
    │   └── page.tsx           # 프로필 설정
    ├── security/
    │   └── page.tsx           # 비밀번호 변경
    ├── api-keys/
    │   └── page.tsx           # API 키 관리
    ├── notifications/
    │   └── page.tsx           # 알림 설정
    ├── billing/
    │   └── page.tsx           # 구독 및 결제
    ├── webhooks/
    │   └── page.tsx           # 웹훅 설정
    └── activity/
        └── page.tsx           # 활동 로그
```

### 6.2 컴포넌트 구조

```
components/
├── layout/
│   ├── DashboardLayout.tsx   # 대시보드 레이아웃 (사이드바 포함)
│   └── Sidebar.tsx            # 사이드바 네비게이션
├── ui/                        # 재사용 가능한 UI 컴포넌트
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Modal.tsx
│   ├── Badge.tsx
│   ├── Avatar.tsx
│   ├── Skeleton.tsx
│   ├── Pagination.tsx
│   ├── DateRangePicker.tsx
│   ├── JSONViewer.tsx
│   └── VirtualList.tsx
├── search/
│   └── GlobalSearch.tsx       # 전역 검색 (Cmd+K)
├── filters/
│   └── FilterPanel.tsx        # 필터 패널
├── notifications/
│   └── NotificationCenter.tsx # 알림 센터
├── subscription/
│   ├── PlanSelector.tsx       # 플랜 선택기
│   └── UsageDashboard.tsx     # 사용량 대시보드
├── export/
│   └── ExportButton.tsx       # 내보내기 버튼
├── empty/
│   └── EmptyState.tsx         # 빈 상태 컴포넌트
├── error/
│   └── ErrorDisplay.tsx       # 에러 표시 컴포넌트
├── ProjectCard.tsx            # 프로젝트 카드
├── ProjectSettings.tsx        # 프로젝트 설정
├── MemberList.tsx             # 멤버 목록
├── StatsCard.tsx              # 통계 카드
├── QualityChart.tsx           # 품질 차트
├── DriftChart.tsx             # 드리프트 차트
├── Toast.tsx                  # 토스트 알림
├── ToastContainer.tsx         # 토스트 컨테이너
└── ErrorBoundary.tsx          # 에러 바운더리
```

### 6.3 라이브러리 및 유틸리티

```
lib/
└── api.ts                     # API 클라이언트 (모든 API 호출)

hooks/
└── useKeyboardShortcuts.ts   # 키보드 단축키 훅
```

---

## 7. UI/UX 구조

### 7.1 디자인 시스템

#### 색상 팔레트
- **주요 색상**: 검정 (#000000), 회색 계열
- **상태 색상**:
  - 성공: 초록색 (green-100, green-800)
  - 경고: 노란색 (yellow-100, yellow-800)
  - 에러: 빨간색 (red-100, red-800)
  - 정보: 파란색 (blue-100, blue-800)
- **배경**: 회색-50 (#F9FAFB)
- **텍스트**: 회색-900 (#111827), 회색-600 (#4B5563)

#### 타이포그래피
- **폰트**: Inter (Google Fonts)
- **제목**: 
  - H1: text-3xl font-bold
  - H2: text-2xl font-semibold
  - H3: text-xl font-semibold
- **본문**: text-base, text-sm
- **라벨**: text-sm font-medium

#### 간격 시스템
- **컨테이너 패딩**: p-8 (32px)
- **카드 간격**: gap-4, gap-6
- **섹션 간격**: space-y-6, space-y-8

#### 컴포넌트 스타일
- **카드**: bg-white rounded-lg shadow-sm border border-gray-200
- **버튼**: 
  - Primary: bg-black text-white
  - Secondary: bg-gray-100 text-gray-900
- **입력 필드**: border border-gray-300 rounded-md
- **배지**: rounded-full px-2.5 py-1 text-xs

### 7.2 레이아웃 구조

#### 대시보드 레이아웃
```
┌─────────────────────────────────────────────────┐
│  Sidebar (고정, 256px)  │  Main Content Area   │
│  - Logo                  │  - Notification     │
│  - Navigation            │    Center (우측 상단)│
│  - Projects              │  - Global Search    │
│  - User Info             │  - Page Content     │
│  - Settings/Logout       │                     │
└─────────────────────────────────────────────────┘
```

#### 사이드바 구조
- **상단**: AG AgentGuard 로고
- **중간**: 
  - Dashboard (홈)
  - Projects (접을 수 있는 섹션)
    - 프로젝트 목록
    - + New Project 버튼
- **하단**: 
  - 사용자 정보 (이름, 이메일, 플랜)
  - Settings 링크
  - Logout 버튼

### 7.3 페이지별 UI 구조

#### 프로젝트 목록 페이지 (`/dashboard`)
- **헤더**: "Projects" 제목, "Manage your LLM monitoring projects" 부제목
- **액션**: "Create Project" 버튼
- **검색**: "Search projects..." 입력 필드
- **콘텐츠**: 프로젝트 카드 그리드
  - 프로젝트 이름
  - 설명
  - Owner 배지
  - 클릭 시 프로젝트 상세로 이동

#### 프로젝트 상세 페이지 (`/dashboard/[projectId]`)
- **헤더**: 프로젝트 이름, 설명
- **탭 네비게이션**:
  - Overview (기본)
  - API Calls
  - Compare
  - Reports
  - Team Members
  - Settings (Owner/Admin만)
- **Overview 탭**:
  - 통계 카드 4개 (Total API Calls, Avg Quality Score, Total Cost, Success Rate)
  - Quality Scores 차트
  - Drift Detections 차트
- **Team Members 탭**:
  - 멤버 목록 테이블
  - 역할 (Owner, Admin, Member, Viewer)
  - 추가/수정/삭제 버튼 (Owner/Admin만)
- **Settings 탭**:
  - 프로젝트 이름/설명 수정
  - 프로젝트 삭제 (Owner만)

#### API 호출 목록 페이지 (`/dashboard/[projectId]/api-calls`)
- **필터 패널**:
  - 날짜 범위 선택기
  - Provider 필터 (OpenAI, Anthropic, Google)
  - Model 필터
  - Agent Name 필터
  - Status 필터
  - 검색 필드
- **테이블**:
  - 컬럼: 시간, Provider, Model, Agent, Status, Latency, Cost
  - 정렬 가능
  - 페이지네이션
- **액션**: 내보내기 버튼 (CSV, JSON)

#### API 호출 상세 페이지 (`/dashboard/[projectId]/api-calls/[callId]`)
- **헤더**: Provider, Model, Agent, Status, 시간
- **탭**:
  - Request: 요청 데이터 (JSON 뷰어)
  - Response: 응답 데이터 (JSON 뷰어)
  - Metadata: 메타데이터 (토큰, 지연시간, 비용 등)
  - Quality: 품질 점수 (있는 경우)
- **네비게이션**: 이전/다음 API 호출 버튼

#### 드리프트 상세 페이지 (`/dashboard/[projectId]/drift/[driftId]`)
- **헤더**: Detection Type, Severity, Model, Agent, 감지 시간
- **Before/After 비교**:
  - Baseline Value
  - Current Value
  - Change Percentage
- **타임라인**: 드리프트 감지 이력

#### 알림 상세 페이지 (`/dashboard/[projectId]/alerts/[alertId]`)
- **헤더**: Alert Type, Severity, Title, 시간
- **내용**: 메시지, Alert Data
- **상태**: Resolved/Unresolved
- **액션**: Resolve 버튼, Send 버튼

#### 설정 페이지 (`/settings`)
- **서브페이지**:
  - Profile: 이름, 이메일, 아바타 수정, 계정 삭제
  - Security: 비밀번호 변경
  - API Keys: API 키 생성/삭제/복사
  - Notifications: 이메일, 인앱, Slack, Discord 설정
  - Billing: 구독 플랜, 사용량, 결제 정보
  - Webhooks: 웹훅 추가/수정/삭제/테스트
  - Activity: 활동 로그 목록

### 7.4 인터랙션 패턴

#### 키보드 단축키
- `Cmd+K` (Mac) / `Ctrl+K` (Windows): 전역 검색
- `Cmd+N` (Mac) / `Ctrl+N` (Windows): 새 프로젝트 생성
- `ESC`: 모달 닫기, 검색 닫기

#### 모달 및 다이얼로그
- 프로젝트 생성 모달
- API 키 생성 모달 (키 표시)
- 확인 다이얼로그 (삭제 등)

#### 토스트 알림
- 성공: 초록색 배경
- 에러: 빨간색 배경
- 정보: 파란색 배경
- 자동 사라짐 (3초)

#### 로딩 상태
- 스켈레톤 UI (카드, 테이블)
- 스피너 (중앙 정렬)
- 인라인 로딩 (버튼 내)

#### 빈 상태
- "No projects" 메시지
- "No API calls" 메시지
- "No drift detections" 메시지
- 액션 버튼 (예: "Create Project")

---

## 8. 구독 플랜 및 기능

### 8.1 플랜 구조

#### Free ($0/월)
- **프로젝트**: 1개
- **API 호출**: 1,000회/월
- **팀 멤버**: 프로젝트당 1명
- **데이터 보관**: 7일
- **기능**:
  - 드리프트 감지: Basic (길이/포맷만)
  - 품질 평가: Basic (JSON/구조만)
  - 비용 모니터링: Basic
  - 지연시간 분석: ❌
  - 에러 모니터링: ❌
  - 알림: ❌
  - 모델 비교: ❌
  - 에이전트 체인 프로파일링: ❌
  - 리포트: ❌
  - 비용 이상 감지: ❌

#### Indie ($19/월)
- **프로젝트**: 3개
- **API 호출**: 30,000회/월
- **팀 멤버**: 프로젝트당 1명
- **데이터 보관**: 30일
- **기능**:
  - 드리프트 감지: Basic (전체 Basic)
  - 품질 평가: Basic (JSON/구조)
  - 비용 모니터링: ✅
  - 지연시간 분석: ✅
  - 에러 모니터링: ✅
  - 알림: Email만
  - 모델 비교: ❌
  - 에이전트 체인 프로파일링: ❌
  - 리포트: 수동 생성
  - 비용 이상 감지: ✅

#### Startup ($59/월) - Most Popular
- **프로젝트**: 10개
- **API 호출**: 200,000회/월
- **팀 멤버**: 프로젝트당 3명
- **데이터 보관**: 90일
- **기능**:
  - 드리프트 감지: Enhanced (의미/톤 드리프트)
  - 품질 평가: Advanced (LLM 기반 평가)
  - 비용 모니터링: ✅
  - 비용 이상 감지: ✅
  - 지연시간 분석: ✅
  - 에러 모니터링: ✅
  - 알림: Full (Slack/Email/Discord)
  - 모델 비교: ✅ (GPT vs Claude vs Gemini vs Llama)
  - 주간 리포트: ✅ (Weekly AI Health Report)
  - API 토큰 비용 예측: ✅
  - 모델 최적화 추천: ✅
  - 에이전트 체인 프로파일링: ❌
  - 지역별 지연시간: ❌
  - 고급 비용 최적화: ❌
  - 모델 자동 전환: ❌

#### Pro ($199/월)
- **프로젝트**: 무제한 (소프트 리밋)
- **API 호출**: 무제한 (소프트 리밋)
- **팀 멤버**: 프로젝트당 5명
- **데이터 보관**: 180일
- **기능**:
  - Startup의 모든 기능 +
  - 에이전트 체인 프로파일링: ✅ (핵심 기능)
  - 에이전트 단계별 드리프트: ✅
  - 지역별 지연시간: ✅
  - 고급 비용 최적화: ✅
  - 모델 자동 전환 추천: ✅
  - RBAC: ✅ (역할 기반 접근 제어)
  - Self-hosted: ❌
  - 전담 지원: ❌
  - SLA: ❌
  - 데이터 마스킹: ❌
  - 커스텀 평가 규칙: ❌

#### Enterprise ($499/월)
- **프로젝트**: 무제한
- **API 호출**: 무제한
- **팀 멤버**: 커스텀
- **데이터 보관**: 365일 (1년+)
- **기능**:
  - Pro의 모든 기능 +
  - RBAC: Persona 기반 권한 관리
  - Self-hosted: ✅ (온프레미스)
  - 전담 지원: ✅
  - SLA: ✅ (99.9%)
  - 데이터 마스킹: ✅
  - 커스텀 평가 규칙: ✅
  - 커스텀 통합: ✅

### 8.2 기능 제한 구현

- **프로젝트 제한**: `SubscriptionService.check_project_limit()`
- **API 호출 제한**: `UsageMiddleware.check_api_call_limit()`
- **기능 접근 제어**: `SubscriptionService.check_feature_access()`
- **데이터 보관 정책**: 아카이빙 서비스에서 자동 처리

---

## 9. 사용자 플로우

### 9.1 회원가입 플로우
1. 루트 페이지 접속 → `/login`으로 리다이렉트
2. "Don't have an account? Sign up" 클릭
3. 이메일, 비밀번호, 이름 입력
4. "Sign up" 버튼 클릭
5. 자동 로그인 → `/dashboard`로 이동
6. 온보딩 페이지 표시 (선택)

### 9.2 로그인 플로우
1. `/login` 페이지 접속
2. 이메일, 비밀번호 입력
3. "Sign in" 버튼 클릭
4. JWT 토큰 저장 (localStorage)
5. `/dashboard`로 이동

### 9.3 프로젝트 생성 플로우
1. `/dashboard`에서 "Create Project" 버튼 클릭
2. 모달에서 프로젝트 이름, 설명 입력
3. "Create" 버튼 클릭
4. 프로젝트 생성 → 프로젝트 상세 페이지로 이동

### 9.4 API 호출 모니터링 플로우
1. 사용자 애플리케이션에서 AgentGuard 프록시를 통해 LLM API 호출
2. `APIHookMiddleware`가 요청/응답 캡처
3. 데이터 정규화 및 압축
4. 데이터베이스 저장
5. 프론트엔드에서 `/dashboard/[projectId]/api-calls`에서 확인

### 9.5 품질 평가 플로우
1. 프로젝트 상세 페이지에서 "Quality" 탭 선택
2. "Evaluate Quality" 버튼 클릭 (또는 자동 평가)
3. `QualityEvaluator` 서비스가 평가 실행
4. 결과를 `QualityScore` 모델에 저장
5. 차트에 표시

### 9.6 드리프트 감지 플로우
1. 프로젝트 상세 페이지에서 "Drift" 섹션 확인
2. 자동 감지 (백그라운드 작업) 또는 수동 감지
3. `DriftEngine` 서비스가 분석 실행
4. 결과를 `DriftDetection` 모델에 저장
5. 알림 생성 (플랜에 따라)
6. 프론트엔드에서 표시

### 9.7 알림 플로우
1. 드리프트 감지, 비용 이상, 에러 등 이벤트 발생
2. `AlertService`가 알림 생성
3. 사용자 플랜에 따라 알림 채널 선택
4. 이메일/Slack/Discord로 전송
5. 인앱 알림 센터에 표시

---

## 10. 데이터 플로우

### 10.1 API 호출 캡처 플로우

```
사용자 앱
  │
  ├─→ AgentGuard 프록시 (/api/v1/proxy/{provider}/{path})
  │     │
  │     ├─→ APIHookMiddleware: 요청 캡처
  │     │     ├─→ 요청 본문 저장
  │     │     ├─→ 헤더 추출 (X-Project-ID, X-Agent-Name, X-Chain-ID)
  │     │     └─→ 시작 시간 기록
  │     │
  │     ├─→ LLM 제공자 API (OpenAI/Anthropic/Google)
  │     │     └─→ 실제 API 호출
  │     │
  │     ├─→ APIHookMiddleware: 응답 캡처
  │     │     ├─→ 응답 본문 저장
  │     │     ├─→ 지연시간 계산
  │     │     └─→ 토큰 수 추출
  │     │
  │     └─→ DataNormalizer: 데이터 정규화
  │           ├─→ 프롬프트 추출
  │           ├─→ 응답 텍스트 추출
  │           └─→ 압축 (선택)
  │
  └─→ Background Task: 데이터베이스 저장
        └─→ APICall 모델에 저장
```

### 10.2 품질 평가 플로우

```
APICall 데이터
  │
  ├─→ QualityEvaluator.evaluate_batch()
  │     │
  │     ├─→ JSON 유효성 검사
  │     ├─→ 필수 필드 확인
  │     ├─→ 구조 검증
  │     │
  │     └─→ Advanced (Startup+):
  │           ├─→ 의미 일관성 평가 (LLM 기반)
  │           ├─→ 톤 평가
  │           └─→ 일관성 평가
  │
  └─→ QualityScore 모델에 저장
```

### 10.3 드리프트 감지 플로우

```
APICall 데이터 (7일간)
  │
  ├─→ DriftEngine.detect_drift()
  │     │
  │     ├─→ Baseline 계산 (7일 평균)
  │     ├─→ Current 값 계산 (최근)
  │     ├─→ Change Percentage 계산
  │     │
  │     └─→ Detection Types:
  │           ├─→ Length: 응답 길이 변화
  │           ├─→ Structure: JSON 구조 변화
  │           ├─→ Semantic: 의미 변화 (Enhanced 플랜)
  │           ├─→ Style: 스타일 변화 (Enhanced 플랜)
  │           └─→ Latency: 지연시간 변화
  │
  └─→ DriftDetection 모델에 저장
        └─→ Alert 생성 (플랜에 따라)
```

### 10.4 비용 분석 플로우

```
APICall 데이터
  │
  ├─→ CostAnalyzer.analyze_project_costs()
  │     │
  │     ├─→ Provider별 가격표 조회
  │     ├─→ Input/Output 토큰 수 × 가격 계산
  │     ├─→ 모델별 집계
  │     ├─→ Provider별 집계
  │     └─→ 일별 집계
  │
  └─→ CostAnalysisResponse 반환
```

---

## 11. 배포 정보

### 11.1 프론트엔드 배포 (Vercel)

- **플랫폼**: Vercel
- **프레임워크**: Next.js 14
- **Root Directory**: `frontend`
- **Build Command**: `npm run build` (자동)
- **Output Directory**: `.next` (자동)
- **환경 변수**:
  - `NEXT_PUBLIC_API_URL`: 백엔드 API URL (예: `https://agentguard-production-bbb4.up.railway.app`)
- **자동 배포**: GitHub push 시 자동 배포
- **도메인**: `https://agent-guard-*.vercel.app` (프리뷰), 커스텀 도메인 가능

### 11.2 백엔드 배포 (Railway)

- **플랫폼**: Railway
- **프레임워크**: FastAPI
- **Root Directory**: `backend`
- **Build Command**: `pip install -r requirements.txt` (자동)
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **환경 변수**:
  - `DATABASE_URL`: PostgreSQL 연결 문자열 (Railway 자동 생성)
  - `SECRET_KEY`: JWT 시크릿 키 (랜덤 생성)
  - `DEBUG`: `false` (프로덕션)
  - `CORS_ORIGINS`: `*` (모든 origin 허용)
  - `REDIS_URL`: Redis 연결 문자열 (선택, Railway 자동 생성)
- **자동 배포**: GitHub push 시 자동 배포
- **도메인**: `https://agentguard-production-*.up.railway.app`

### 11.3 데이터베이스 (Railway PostgreSQL)

- **플랫폼**: Railway
- **버전**: PostgreSQL 15+
- **저장 공간**: 1GB (무료) 또는 5GB+ ($5/월)
- **자동 백업**: Railway 자동 백업
- **연결**: Railway 내부 네트워크를 통한 자동 연결

### 11.4 CI/CD (GitHub Actions)

- **워크플로우**: `.github/workflows/vercel-deploy-hook.yml`
- **트리거**: `main` 브랜치에 push
- **작업**:
  1. Vercel deploy hook 트리거 (선택, 실패해도 계속)
  2. Railway는 자동으로 GitHub push 감지하여 배포

---

## 12. 환경 변수

### 12.1 백엔드 환경 변수 (Railway)

#### 필수 변수
- `DATABASE_URL`: PostgreSQL 연결 문자열
  - 형식: `postgresql://user:password@host:port/database`
  - Railway에서 자동 생성

- `SECRET_KEY`: JWT 토큰 서명용 시크릿 키
  - 생성 방법: `openssl rand -hex 32`
  - 예시: `a1b2c3d4e5f6...` (64자)

#### 선택 변수
- `DEBUG`: 디버그 모드 (`true`/`false`)
  - 기본값: `false`
  - 프로덕션: `false` 권장

- `CORS_ORIGINS`: CORS 허용 origin
  - 기본값: `*` (모든 origin 허용)
  - 형식: `http://localhost:3000,https://your-app.vercel.app` (쉼표 구분)

- `REDIS_URL`: Redis 연결 문자열
  - 형식: `redis://host:port/db`
  - Railway에서 자동 생성 (Redis 추가 시)

- `OPENAI_API_KEY`: OpenAI API 키 (프록시 사용 시)
- `ANTHROPIC_API_KEY`: Anthropic API 키 (프록시 사용 시)
- `GOOGLE_API_KEY`: Google API 키 (프록시 사용 시)

### 12.2 프론트엔드 환경 변수 (Vercel)

#### 필수 변수
- `NEXT_PUBLIC_API_URL`: 백엔드 API URL
  - 예시: `https://agentguard-production-bbb4.up.railway.app`
  - `NEXT_PUBLIC_` 접두사 필수 (클라이언트에서 접근 가능)

---

## 13. 보안 및 인증

### 13.1 인증 시스템

#### JWT 토큰
- **액세스 토큰**: 30분 만료
- **리프레시 토큰**: 7일 만료
- **알고리즘**: HS256
- **저장**: localStorage (프론트엔드)

#### 비밀번호
- **해싱**: bcrypt
- **라운드**: 12

#### API 키
- **형식**: `ag_` 접두사 + 랜덤 문자열
- **저장**: 해시만 저장 (SHA-256)
- **사용**: API 요청 시 `Authorization: Bearer {api_key}` 헤더

### 13.2 권한 시스템

#### 프로젝트 역할
- **Owner**: 모든 권한 (프로젝트 삭제 포함)
- **Admin**: 멤버 관리, 설정 수정
- **Member**: 읽기/쓰기 권한
- **Viewer**: 읽기 전용

#### 접근 제어
- `check_project_access()`: 프로젝트 접근 권한 확인
- `check_feature_access()`: 기능 접근 권한 확인 (플랜 기반)

### 13.3 CORS 설정
- **현재 설정**: 모든 origin 허용 (`*`)
- **이유**: Vercel 프리뷰 URL이 매번 달라지기 때문
- **프로덕션 권장**: 특정 도메인만 허용 (보안 강화)

---

## 14. 성능 최적화

### 14.1 데이터 압축
- **압축 방식**: gzip
- **압축률**: 60-70% 절감
- **적용**: 요청/응답 데이터 저장 시

### 14.2 캐싱 전략
- **Redis 캐싱**: 
  - API 호출 목록 (첫 페이지, 5분 TTL)
  - 프로젝트 목록 (1분 TTL)
- **프론트엔드 캐싱**: 
  - React 상태 관리
  - localStorage (토큰)

### 14.3 데이터베이스 최적화
- **인덱싱**: 
  - `project_id`, `created_at`, `provider`, `model`, `agent_name` 등
- **연결 풀링**: 
  - pool_size: 10
  - max_overflow: 20
  - pool_recycle: 3600초

### 14.4 비동기 처리
- **백그라운드 작업**: 
  - API 호출 저장
  - 품질 평가
  - 드리프트 감지
- **비동기 HTTP**: httpx (비동기 클라이언트)

### 14.5 데이터 아카이빙
- **보관 정책**: 플랜별 데이터 보관 기간
- **아카이빙**: 오래된 데이터를 S3 등으로 이동 (구현 예정)

---

## 15. 추가 정보

### 15.1 지원하는 LLM 제공자
- **OpenAI**: GPT-4, GPT-3.5-turbo 등
- **Anthropic**: Claude-3, Claude-2 등
- **Google**: Gemini-Pro, Gemini-Ultra 등

### 15.2 모니터링 메트릭
- API 호출 수
- 성공률
- 평균 지연시간
- 비용 (USD)
- 품질 점수 (0-100)
- 드리프트 점수 (0-100)

### 15.3 알림 채널
- **이메일**: SMTP (구현 예정)
- **Slack**: Webhook URL
- **Discord**: Webhook URL
- **인앱**: 알림 센터

### 15.4 데이터 내보내기 형식
- **CSV**: 스프레드시트 호환
- **JSON**: 프로그래밍 호환

### 15.5 리포트 형식
- **PDF**: 다운로드 가능
- **JSON**: API로 접근 가능

---

## 16. 개발 및 테스트

### 16.1 로컬 개발 환경
- **Docker Compose**: 전체 스택 실행
- **개별 실행**: 
  - 백엔드: `uvicorn app.main:app --reload`
  - 프론트엔드: `npm run dev`

### 16.2 테스트
- **백엔드**: pytest (구현 예정)
- **프론트엔드**: Jest, React Testing Library (구현 예정)

### 16.3 샘플 데이터
- **엔드포인트**: `/api/v1/admin/generate-sample-data`
- **권한**: Superuser만 접근 가능

---

## 17. 로깅 및 모니터링

### 17.1 로깅
- **백엔드**: Python logging 모듈
- **레벨**: DEBUG (개발), INFO (프로덕션)
- **출력**: Railway 로그 스트림

### 17.2 모니터링 (구현 예정)
- **에러 추적**: Sentry
- **성능 모니터링**: APM 도구
- **사용량 분석**: Analytics

---

## 18. 제한 사항 및 향후 계획

### 18.1 현재 제한 사항
- Paddle 결제 통합 미완성
- 이메일 알림 미구현
- Self-hosted 옵션 미구현
- 데이터 아카이빙 자동화 미구현

### 18.2 향후 계획
- Paddle 결제 통합 완성
- 이메일 알림 구현
- Self-hosted 옵션 구현
- 데이터 아카이빙 자동화
- SDK 완성 (Python, Node.js)
- 모바일 앱 (선택)

---

## 19. 연락처 및 지원

### 19.1 문서
- API 문서: `/docs` (Swagger UI)
- ReDoc: `/redoc`

### 19.2 지원
- 이메일: (설정 필요)
- 문서: GitHub README

---

**문서 버전**: 1.0  
**최종 업데이트**: 2024년  
**작성자**: AgentGuard 개발팀

