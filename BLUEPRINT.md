# PluvianAI 기술 청사진

**버전**: 2.0  
**최종 업데이트**: 2026-02-17  
**프로젝트**: PluvianAI — LLM/Agent 검증 및 배포 전 검증 플랫폼

---

## 1. 시스템 개요

### 1.1 프로젝트 목적
PluvianAI는 LLM 기반 에이전트의 **규칙 기반 검증**, **에이전트 단위 진단(Live View)**, **배포 전 검증(Release Gate)**을 제공하는 플랫폼입니다.

### 1.2 핵심 가치 제안
- **규칙 기반 검증**: LLM Judge 없이 Atomic Signals(결정론적 신호)로 재현 가능한 평가
- **에이전트 단위 진단**: Live View에서 에이전트별 Clinical Log·Data·시그널 한 화면
- **Release Gate**: 저장된 트래픽 리플레이 → 규칙 검증 → 통과한 트레이스만 배포
- **Zero-Config 모니터링**: SDK 최소 연동으로 LLM API 호출 자동 수집
- **배포 신뢰성**: Behavior 규칙·Validation Dataset·Release Gate Validate로 회귀를 배포 전에 차단

---

## 2. 아키텍처 설계

### 2.1 전체 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
├─────────────────────────────────────────────────────────────┤
│  Web Frontend (Next.js)  │  Python SDK  │  Node.js SDK      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                        │
├─────────────────────────────────────────────────────────────┤
│  FastAPI Backend (Python)                                    │
│  - REST API v1/v2                                            │
│  - WebSocket (Live View)                                     │
│  - Middleware Stack                                          │
│    • CORS                                                    │
│    • Authentication                                          │
│    • Rate Limiting                                           │
│    • Logging                                                 │
│    • Metrics                                                 │
│    • API Hook (LLM Call Capture)                             │
└─────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  PostgreSQL  │   │    Redis     │   │   Stream     │
│  (Primary DB)│   │   (Cache)    │   │  Processor   │
└──────────────┘   └──────────────┘   └──────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer                              │
├─────────────────────────────────────────────────────────────┤
│  • Project Service        • Test Lab Service                 │
│  • Snapshot Service       • Signal Detection Service         │
│  • Live View Service      • Cost Analyzer Service            │
│  • Quality Evaluator      • Billing Service                 │
│  • Alert Service          • Firewall Service                 │
│  • Stream Processor       • Review Service                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 데이터베이스 스키마

#### 핵심 엔티티 관계도

```
Organization (조직)
    ├── User (사용자)
    │   ├── Subscription (구독)
    │   └── UserApiKey (API 키)
    │
    └── Project (프로젝트)
        ├── ProjectMember (멤버)
        ├── APIKey (프로젝트 API 키)
        │
        ├── Agent (에이전트)
        │   ├── APICall (API 호출 기록)
        │   ├── Snapshot (스냅샷)
        │   ├── Trace (트레이스)
        │   └── SignalDetection (신호 감지)
        │
        ├── TestRun (테스트 실행)
        │   └── TestResult (테스트 결과)
        │
        ├── QualityScore (품질 점수)
        ├── DriftDetection (드리프트 감지)
        ├── Alert (알림)
        └── FirewallRule (방화벽 규칙)
```

#### 주요 테이블 구조

**Organizations & Users**
- `organizations`: 조직 정보
- `users`: 사용자 계정
- `organization_members`: 조직 멤버십
- `subscriptions`: 구독 정보 (Stripe 연동)

**Projects**
- `projects`: 프로젝트 메타데이터
- `project_members`: 프로젝트 멤버
- `api_keys`: 프로젝트 API 키
- `user_api_keys`: 사용자 API 키

**Monitoring & Tracing**
- `api_calls`: LLM API 호출 기록 (JSONB)
- `traces`: 분산 트레이싱 데이터
- `snapshots`: 스냅샷 저장
- `live_view_connections`: Live View 연결 상태

**Testing**
- `test_runs`: 테스트 실행 기록
- `test_results`: 테스트 결과
- `test_lab_canvas`: Test Lab 캔버스 설정

**Quality & Safety**
- `quality_scores`: 품질 점수
- `drift_detections`: 드리프트 감지 결과
- `signal_detections`: 신호 감지 결과
- `signal_configs`: 신호 설정
- `evaluation_rubrics`: 평가 루브릭

**Alerts & Notifications**
- `alerts`: 알림 기록
- `notification_settings`: 알림 설정
- `webhooks`: 웹훅 설정

**Billing & Usage**
- `usage`: 사용량 기록
- `audit_logs`: 감사 로그

---

## 3. 핵심 기능 모듈

### 3.1 Node Discovery (에이전트 자동 감지)

**목적**: SDK 연동 후 트래픽 분석을 통해 새로운 에이전트(노드)를 자동으로 감지

**구현 방식**:
1. SDK가 LLM 호출을 인터셉트하여 PluvianAI API로 전송
2. `APIHookMiddleware`가 호출을 캡처하여 `api_calls` 테이블에 저장
3. `StreamProcessor`가 실시간으로 트래픽 분석
4. 새로운 `System Prompt Hash`가 발견되면 "Ghost Node"로 등록
5. Live View에서 감지된 에이전트 목록 표시

**주요 컴포넌트**:
- `backend/app/middleware/api_hook.py`: API 호출 캡처
- `backend/app/services/stream_processor.py`: 스트림 처리
- `frontend/components/live-view/AgentCardNode.tsx`: 에이전트 노드 시각화

### 3.2 Live View (실시간 모니터링)

**목적**: 에이전트의 실시간 상태 및 성능 모니터링

**기능**:
- 실시간 에이전트 상태 표시
- 연결 관계 시각화
- 텔레메트리 통계 (Latency, Success Rate, Safety Score)
- Critical 이슈 자동 감지 및 Triage Dashboard
- Clinical Log: 에이전트별 상세 로그

**주요 컴포넌트**:
- `backend/app/api/v1/endpoints/live_view.py`: Live View API
- `frontend/app/organizations/[orgId]/projects/[projectId]/live-view/page.tsx`: Live View 페이지
- `frontend/components/live-view/TriageDashboard.tsx`: Critical 이슈 대시보드

### 3.3 Test Lab (테스트 실험실)

**목적**: 프롬프트/모델 변경 테스트 및 A/B 테스트

**기능**:
- **모델 변경 테스트**: 프롬프트 고정, 모델만 변경하여 재실행
- **프롬프트 변경 테스트**: 모델 고정, 프롬프트만 변경하여 실행
- **Safe-to-Deploy 판정**: 변경 사항이 기존 성능을 저해하지 않음을 검증하고 배포 가능 여부 판단
- **시각적 테스트 구성**: ReactFlow 기반 노드 편집기
- **노드 타입**:
  - Input Node: 테스트 입력
  - Router Node: 라우팅 로직
  - Agent Node: 에이전트 실행
  - Eval Node: 평가 로직
  - Approval Node: Human-in-the-loop 승인

**주요 컴포넌트**:
- `backend/app/api/v1/endpoints/test_lab.py`: Test Lab API
- `backend/app/services/test_lab_service.py`: 테스트 실행 로직
- `frontend/app/organizations/[orgId]/projects/[projectId]/test-lab/page.tsx`: Test Lab 페이지

### 3.4 Signal Detection (신호 감지)

**목적**: 규칙 기반 품질 평가 (LLM Judge 대신 규칙 기반)

**평가 축 (Dimensions)**:
- **Input Contract**: 입력 유효성 및 전처리 상태 검증
- **Prompt/Policy Quality**: 시스템 프롬프트 준수 여부 및 정책 품질
- **Tool Interface**: 도구 선택의 정확도 및 파라미터 유효성
- **Control Loop Stability**: 루프 안정성 및 제어 흐름의 효율성
- **Output Contract**: 최종 응답 형식 준수 및 안전성

**평가 카테고리**:
- **SAFE**: 안전한 응답
- **NEEDS_REVIEW**: 검토 필요
- **CRITICAL**: 심각한 문제

**감지 규칙 예시**:
- PII (개인정보) 노출 감지
- 독성 언어 감지
- 프롬프트 인젝션 감지
- 출력 길이 이상 감지
- 비용 이상 감지

**주요 컴포넌트**:
- `backend/app/services/signal_detection_service.py`: 신호 감지 로직
- `backend/app/models/signal_detection.py`: 신호 모델

### 3.5 Snapshot (스냅샷 관리)

**목적**: 특정 시점의 에이전트 상태 및 데이터 저장

**기능**:
- 스냅샷 생성 (수동/자동)
- 스냅샷 비교
- 스냅샷 복원
- 히스토리 관리

**주요 컴포넌트**:
- `backend/app/services/snapshot_service.py`: 스냅샷 서비스
- `frontend/app/organizations/[orgId]/projects/[projectId]/snapshots/page.tsx`: 스냅샷 페이지

### 3.6 Cost Monitoring (비용 모니터링)

**목적**: 모델별 API 호출 비용 추적 및 최적화

**기능**:
- 모델별 비용 집계
- 프로젝트/조직별 비용 분석
- 비용 이상 감지 (Anomaly Detection)
- 비용 최적화 제안

**주요 컴포넌트**:
- `backend/app/services/cost_analyzer.py`: 비용 분석
- `backend/app/services/pricing_updater.py`: 모델 가격 정보 관리
- `backend/app/api/v1/endpoints/cost.py`: 비용 API

### 3.7 Quality Scoring (품질 점수)

**목적**: 에이전트 응답의 품질을 수치화하여 추적

**평가 지표**:
- 정확도 (Accuracy)
- 일관성 (Consistency)
- 안전성 (Safety)
- 응답 시간 (Latency)

**주요 컴포넌트**:
- `backend/app/services/quality_evaluator.py`: 품질 평가 로직
- `backend/app/models/quality_score.py`: 품질 점수 모델

---

## 4. 기술 스택 상세

### 4.1 Backend

**프레임워크**: FastAPI (Python 3.11+)
- 비동기 처리 지원
- 자동 OpenAPI 문서 생성
- 타입 힌팅 기반 검증

**데이터베이스**:
- **PostgreSQL**: 메인 데이터베이스
- **JSONB**: 유연한 스키마 저장 (API 호출 데이터 등)
- **Alembic**: 마이그레이션 관리

**캐싱**:
- **Redis**: 세션, 캐시, Rate Limiting

**인증/보안**:
- JWT 기반 인증
- Cookie 기반 세션 관리
- API Key 인증 (프로젝트별)
- Rate Limiting
- CORS 관리

**모니터링 & 로깅**:
- **Sentry**: 에러 추적
- **Prometheus**: 메트릭 수집
- 구조화된 로깅 (JSON)

**배포**:
- **Railway**: 백엔드 호스팅
- **Docker**: 컨테이너화

### 4.2 Frontend

**프레임워크**: Next.js 14 (App Router)
- React 18
- TypeScript
- Server Components & Client Components

**UI 라이브러리**:
- **Tailwind CSS**: 스타일링
- **Framer Motion**: 애니메이션
- **ReactFlow**: 그래프 시각화
- **Lucide React**: 아이콘

**상태 관리**:
- **SWR**: 데이터 페칭 및 캐싱
- React Context (로컬 상태)

**배포**:
- **Vercel**: 프론트엔드 호스팅
- 자동 배포 (Git push)

### 4.3 SDK

**Python SDK** (제품명: PluvianAI, 패키지명: pluvianai):
- `pluvianai` 패키지
- LLM 호출 인터셉션
- 비동기/동기 지원

**Node.js SDK** (제품명: PluvianAI, 패키지명: pluvianai):
- `pluvianai` 패키지
- TypeScript 지원
- Promise 기반 API

---

## 5. API 설계

### 5.1 API 버전 관리

- **v1**: 안정 버전 (현재 프로덕션)
- **v2**: 개발 중 (미래 breaking changes)

### 5.2 주요 엔드포인트

**인증**
- `POST /api/v1/auth/register`: 회원가입
- `POST /api/v1/auth/login`: 로그인
- `POST /api/v1/auth/logout`: 로그아웃
- `GET /api/v1/auth/me`: 현재 사용자 정보

**조직 & 프로젝트**
- `GET /api/v1/organizations`: 조직 목록
- `POST /api/v1/organizations`: 조직 생성
- `GET /api/v1/projects`: 프로젝트 목록
- `POST /api/v1/projects`: 프로젝트 생성
- `GET /api/v1/projects/{project_id}`: 프로젝트 상세

**Live View**
- `GET /api/v1/projects/{project_id}/live-view/agents`: 에이전트 목록
- `GET /api/v1/projects/{project_id}/live-view/connections`: 연결 관계
- `GET /api/v1/projects/{project_id}/live-view/agents/{agent_id}/settings`: 에이전트 설정

**Release Gate**
- `POST /api/v1/projects/{project_id}/release-gate/validate`: 트레이스 리플레이 + 정책 검증 (Pass/Fail)
- `GET /api/v1/projects/{project_id}/release-gate/suggest-baseline`: 베이스라인 트레이스 추천
- `GET /api/v1/projects/{project_id}/release-gate/history`: 검증 이력

**Signal Detection**
- `GET /api/v1/projects/{project_id}/signals`: 신호 목록
- `POST /api/v1/projects/{project_id}/signals/config`: 신호 설정

**Cost**
- `GET /api/v1/projects/{project_id}/cost/summary`: 비용 요약
- `GET /api/v1/projects/{project_id}/cost/breakdown`: 비용 상세 분석

---

## 6. 보안 설계

### 6.1 인증 및 권한

**인증 방식**:
1. **Cookie 기반 인증**: 웹 프론트엔드용
2. **API Key 인증**: SDK 및 외부 통합용
3. **JWT 토큰**: 장기 세션용

**권한 관리**:
- 조직 레벨 권한 (Owner, Admin, Member)
- 프로젝트 레벨 권한 (Owner, Admin, Viewer)
- RBAC (Role-Based Access Control)

### 6.2 데이터 보안

- **PII 마스킹**: 민감 정보 자동 마스킹 옵션
- **암호화**: 전송 중 암호화 (HTTPS), 저장 시 암호화 옵션
- **감사 로그**: 모든 중요한 작업 기록

### 6.3 방화벽

- **Firewall Rules**: 프로젝트별 접근 제어 규칙
- **Rate Limiting**: API 호출 제한
- **IP 화이트리스트**: Enterprise 플랜

---

## 7. 성능 최적화

### 7.1 캐싱 전략

- **Redis 캐싱**: 자주 조회되는 데이터 (프로젝트 목록, 설정 등)
- **CDN**: 정적 자산 (Vercel 자동 CDN)
- **Database Indexing**: 자주 쿼리되는 컬럼 인덱싱

### 7.2 비동기 처리

- **Background Tasks**: 무거운 작업 (테스트 실행, 리포트 생성 등)
- **Stream Processing**: 실시간 데이터 처리
- **Queue System**: 작업 큐 (향후 구현)

### 7.3 데이터베이스 최적화

- **JSONB 인덱싱**: API 호출 데이터 효율적 검색
- **파티셔닝**: 대용량 테이블 (향후 구현)
- **아카이빙**: 오래된 데이터 아카이브 (S3 Glacier)

---

## 8. 확장성 계획

### 8.1 수평 확장

- **Stateless Backend**: 여러 인스턴스 실행 가능
- **Database Replication**: 읽기 전용 복제본
- **Redis Cluster**: 분산 캐싱

### 8.2 기능 확장

- **Webhook 지원**: 이벤트 알림
- **CI/CD 통합**: GitHub Actions, GitLab CI
- **Self-Hosted 옵션**: Enterprise 플랜
- **다국어 지원**: i18n

---

## 9. 모니터링 및 운영

### 9.1 헬스 체크

- `/health`: 기본 헬스 체크
- `/health/live`: Liveness Probe
- `/health/ready`: Readiness Probe (DB 연결 확인)

### 9.2 메트릭

- **Prometheus 메트릭**: API 호출 수, 응답 시간, 에러율
- **비즈니스 메트릭**: 활성 사용자 수, 프로젝트 수, API 호출 수

### 9.3 알림

- **Sentry**: 에러 알림
- **Email**: 중요 이벤트 알림
- **Slack/Discord**: 팀 알림 (향후 구현)

---

## 10. 배포 전략

### 10.1 CI/CD 파이프라인

1. **코드 푸시** → GitHub
2. **자동 테스트** → GitHub Actions
3. **자동 배포**:
   - Frontend → Vercel
   - Backend → Railway

### 10.2 환경 관리

- **Development**: 로컬 개발 환경
- **Staging**: 테스트 환경 (향후 구현)
- **Production**: 프로덕션 환경

---

## 11. 향후 로드맵

### Phase 1 (완료)
- ✅ Live View (에이전트 노드, Clinical Log, Data, Evaluation)
- ✅ Release Gate (Validate, History, 리플레이 + 정책 검증)
- ✅ Atomic Signals / Behavior Rules
- ✅ Validation Dataset, CI Gate

### Phase 2 (진행 중)
- 🔄 Release Gate UX 강화 (트레이스/데이터셋 선택, 결과 시그널 요약)
- 🔄 Drift API/탭 복구 및 노출
- 🔄 비용/레이턴시 대시 요약 노출
- 🔄 Webhook·CI 문서화

### Phase 3 (계획)
- 📋 Shadow testing (실트래픽 기반 후보 모델 검증)
- 📋 Self-Hosted 옵션
- 📋 Advanced Analytics

---

## 12. 참고 문서

- [API 스펙](./SCHEMA_SPEC.md)
- [사업계획서](./BUSINESS_PLAN.md)
- [SDK 문서](./sdk/python/README.md), [Node SDK](./sdk/node/README.md)
