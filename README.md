# PluvianAI

**The Symbiotic Guardian for AI Agents.** — LLM/Agent 검증 및 배포 전 검증 플랫폼

---

## 핵심 가치

- **규칙 기반 검증**: LLM Judge 없이 결정론적 시그널(Atomic Signals)로 재현 가능한 평가
- **에이전트 단위 진단**: Live View에서 에이전트별 Clinical Log·Data·시그널 한 화면
- **Release Gate**: 저장된 트래픽 리플레이 → 규칙 검증 → 통과한 트레이스만 배포

---

## 핵심 기능

| 기능 | 설명 |
|------|------|
| **Live View** | SDK 연동 → 트래픽 분석 → 에이전트 노드·Clinical Log·Data·Evaluation |
| **Release Gate** | 고정 트레이스 + 리플레이(모델/프롬프트 오버라이드) + 정책 회귀 검증 → Pass/Fail |
| **Atomic Signals** | 규칙 기반 평가 (길이·레이턴시·JSON·PII·키워드 등) — LLM Judge 아님 |
| **Behavior Rules** | 툴 호출/궤적 검증, Validation Dataset, CI Gate |

---

## 기술 스택

- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL + JSONB
- **Frontend**: Next.js (TypeScript)
- **SDK**: Python (`agentguard`), Node.js (`@agentguard/sdk`)
- **Infrastructure**: Docker, Redis

---

## 빠른 시작

### 1. SDK 연동 (한 줄)

**Python**
```python
import agentguard
agentguard.init(api_key="YOUR_API_KEY")
```

**Node.js**
```typescript
import agentguard from '@agentguard/sdk';
agentguard.init({ apiKey: 'YOUR_API_KEY' });
```

### 2. 에이전트 자동 감지 (Live View)

SDK 연동 후 트래픽이 쌓이면 에이전트가 Live View에 노드로 표시됩니다.

### 3. Release Gate (배포 전 검증)

- **Release Gate** 탭에서 Trace ID(또는 Validation Dataset) 입력
- 모델/시스템 프롬프트 오버라이드 선택
- Validate 실행 → 리플레이 + 정책 검증 → Pass/Fail 및 History 확인

---

## 프로젝트 구조

```
PluvianAI/
├── backend/              # FastAPI 백엔드
│   ├── app/
│   │   ├── api/         # API 라우터
│   │   ├── core/        # 설정, 보안
│   │   ├── models/      # DB 모델
│   │   ├── services/    # 비즈니스 로직
│   │   └── middleware/  # Proxy
│   └── tests/
├── frontend/             # Next.js 프론트엔드
│   ├── app/             # App Router
│   ├── components/      # React 컴포넌트
│   └── lib/             # 유틸리티
├── sdk/                  # SDK 패키지
│   ├── python/
│   └── node/
├── docs/                 # 문서 (참고: 루트 .md가 단일 소스)
└── docker-compose.yml
```

---

## 문서 (단일 소스 — 루트 기준)

- **[DOCS_README.md](./DOCS_README.md)** — 문서 목록 및 안내 (먼저 참고)
- **[BLUEPRINT.md](./BLUEPRINT.md)** — 기술 청사진 (아키텍처, API, 로드맵)
- **[BUSINESS_PLAN.md](./BUSINESS_PLAN.md)** — 사업계획서
- **[SCHEMA_SPEC.md](./SCHEMA_SPEC.md)** — API 스키마 명세
- **[PRD_AGENT_BEHAVIOR_VALIDATION.md](./PRD_AGENT_BEHAVIOR_VALIDATION.md)** — Behavior Validation PRD

> 문서는 이 루트의 `.md` 파일만 기준으로 합니다. `docs/` 내 이전 버전 문서는 참고하지 마세요. 경로: `C:\Users\user\Desktop\AgentGuard`, 브랜드: **PluvianAI**.

---

## 배포

### 프로덕션 (Vercel + Railway)

```bash
git add .
git commit -m "feat: 새로운 기능"
git push origin main
```

- **Frontend**: Vercel 자동 배포
- **Backend**: Railway 자동 배포

### 로컬 개발

```bash
# 환경 변수 설정
cp .env.example .env

# Docker Compose로 실행
docker-compose up -d

# 접속
# Backend: http://localhost:8000
# Frontend: http://localhost:3000
```

---

## 환경 변수

```bash
# PluvianAI SDK (패키지명은 agentguard 유지)
export AGENTGUARD_API_KEY="your-api-key"
export AGENTGUARD_PROJECT_ID="your-project-id"
export AGENTGUARD_API_URL="https://api.example.com"  # Optional
```

---

## 라이선스

MIT
