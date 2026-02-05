# Synpira

**The test lab for agents.** — LLM/Agent 테스트 전용 서비스

---

## 핵심 기능

| 기능 | 설명 |
|------|------|
| **Auto-Mapping** | SDK 연동 → 트래픽 분석 → 에이전트 구조 자동 시각화 |
| **Test Lab (모델 변경)** | 프롬프트 고정, 모델만 변경 → 재실행 |
| **Test Lab (프롬프트 변경)** | 모델 고정, 프롬프트만 변경 → 실행 |
| **Signal Detection** | 규칙 기반 평가 (LLM Judge 아님) |
| **Worst Prompt Set** | 실패 케이스 자동 수집 |
| **Human-in-the-loop** | 애매한 케이스 사람 검토 |

---

## 기술 스택

- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL + JSONB
- **Frontend**: Next.js (TypeScript)
- **SDK**: Python, Node.js
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

### 2. 자동 구조 생성

SDK 연동 후 트래픽이 쌓이면 에이전트 구조가 자동으로 시각화됩니다.

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Agent A    │ ───→ │  Agent B    │ ───→ │  Agent C    │
│ (Classifier)│      │  (Writer)   │      │  (Summary)  │
└─────────────┘      └─────────────┘      └─────────────┘
```

### 3. 테스트 실행

- **Test Lab**: 프롬프트 그대로 모델만 바꿔서 재실행, 또는 모델 그대로 프롬프트만 바꿔서 실행
- **Signal 평가**: 규칙 기반으로 SAFE / NEEDS_REVIEW / CRITICAL 판정

---

## 프로젝트 구조

```
AgentGuard/
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
├── docs/                 # 문서
└── docker-compose.yml
```

---

## 문서

- **[docs/BLUEPRINT.md](./docs/BLUEPRINT.md)** - 마스터 블루프린트
- **[docs/DETAILED_DESIGN.md](./docs/DETAILED_DESIGN.md)** - 상세 설계
- **[docs/QUICK_START.md](./docs/QUICK_START.md)** - 빠른 시작 가이드
- **[SCHEMA_SPEC.md](./SCHEMA_SPEC.md)** - API 스키마 명세

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
# AgentGuard SDK
export AGENTGUARD_API_KEY="your-api-key"
export AGENTGUARD_PROJECT_ID="your-project-id"
export AGENTGUARD_API_URL="https://api.agentguard.dev"  # Optional
```

---

## 라이선스

MIT
