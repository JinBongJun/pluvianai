# AgentGuard

LLM 에이전트의 품질, 비용, 드리프트를 모니터링하는 SaaS 플랫폼의 MVP입니다.

## 기술 스택

- **Backend**: FastAPI (Python)
- **Database**: PostgreSQL + JSONB
- **Frontend**: Next.js (TypeScript)
- **SDK**: Python, Node.js
- **Infrastructure**: Docker, Redis (캐싱/큐)

## 프로젝트 구조

```
AgentGuard/
├── backend/              # FastAPI 백엔드
│   ├── app/
│   │   ├── api/         # API 라우터
│   │   ├── core/        # 설정, 보안
│   │   ├── models/      # DB 모델
│   │   ├── services/    # 비즈니스 로직
│   │   └── middleware/  # API Hook/Proxy
│   ├── tests/
│   └── requirements.txt
├── frontend/             # Next.js 프론트엔드
│   ├── app/             # App Router
│   ├── components/      # React 컴포넌트
│   ├── lib/             # 유틸리티
│   └── package.json
├── sdk/                  # SDK 패키지
│   ├── python/
│   └── node/
└── docker-compose.yml
```

## 시작하기

### 사전 요구사항

- Docker & Docker Compose
- Python 3.11+ (로컬 개발용)
- Node.js 18+ (로컬 개발용)

### 실행 방법

1. 환경 변수 설정:
   ```bash
   cp .env.example .env
   ```

2. Docker Compose로 서비스 시작:
   ```bash
   docker-compose up -d
   ```

3. 백엔드 접속: http://localhost:8000
4. 프론트엔드 접속: http://localhost:3000

## Zero-Config SDK 사용법

AgentGuard는 코드 변경 없이 LLM API 호출을 자동으로 모니터링합니다.

### Python

```bash
pip install agentguard
```

```python
import agentguard

# 한 줄로 초기화 - OpenAI SDK 자동 패칭
agentguard.init()

# 이제 모든 OpenAI 호출이 자동으로 모니터링됩니다
from openai import OpenAI
client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### Node.js

```bash
npm install @agentguard/sdk
```

```typescript
import agentguard from '@agentguard/sdk';

// 한 줄로 초기화 - OpenAI SDK 자동 패칭
agentguard.init();

// 이제 모든 OpenAI 호출이 자동으로 모니터링됩니다
import OpenAI from 'openai';
const openai = new OpenAI();
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### 환경 변수

```bash
export AGENTGUARD_API_KEY="your-api-key"
export AGENTGUARD_PROJECT_ID="123"
export AGENTGUARD_API_URL="https://api.agentguard.dev"  # Optional
export AGENTGUARD_AGENT_NAME="my-agent"  # Optional
```

더 자세한 내용은 [온보딩 가이드](./frontend/app/onboarding/page.tsx)를 참조하세요.

## 배포

### 프로덕션 배포 (Vercel + Railway)

Git Push 기반 자동 배포를 지원합니다.

**빠른 시작:**
1. GitHub에 저장소 푸시
2. Railway에서 백엔드 배포 (자동)
3. Vercel에서 프론트엔드 배포 (자동)

**상세 가이드:**
- [배포 가이드](./DEPLOYMENT_GUIDE.md) 참조

### 확장 가이드

서비스 성장에 따른 확장 전략:
- [확장 가이드](./SCALING_GUIDE.md) 참조

## 개발 단계

현재 Phase 1 개발 중입니다. 자세한 내용은 개발 계획 문서를 참조하세요.

## 문서

- [진행 상황 요약](./PROGRESS_SUMMARY.md) - 전체 개발 진행 상황
- [배포 가이드](./DEPLOYMENT_GUIDE.md) - Vercel + Railway 배포
- [확장 가이드](./SCALING_GUIDE.md) - 단계별 확장 전략
- [아키텍처 가이드](./ARCHITECTURE.md) - 하이브리드 아키텍처 전략
- [용량 계획](./CAPACITY_PLANNING.md) - 초기 설정 용량 및 사용자 수
- [최적화 가이드](./OPTIMIZATION_GUIDE.md) - 적용된 최적화 전략
- [추가 최적화](./ADDITIONAL_OPTIMIZATIONS.md) - 추가 최적화 가능 항목
- [설정 가이드](./SETUP_GUIDE.md) - 로컬 개발 환경 설정

## 라이선스

MIT


