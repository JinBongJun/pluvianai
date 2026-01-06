# AgentGuard 배포 가이드

Vercel + Railway를 사용한 Git Push 기반 배포 가이드입니다.

## 배포 아키텍처

```
GitHub Repository
    ├── frontend/ → Vercel (자동 배포)
    └── backend/ → Railway (자동 배포)
            ├── PostgreSQL (Railway)
            └── Redis (Railway, 선택)
```

## 사전 준비

### 1. GitHub 저장소 생성

```bash
# 현재 프로젝트를 Git 저장소로 변환
git init
git add .
git commit -m "Initial commit: AgentGuard MVP"

# GitHub에 새 저장소 생성 후
git remote add origin https://github.com/yourusername/AgentGuard.git
git branch -M main
git push -u origin main
```

### 2. 환경 변수 준비

프로덕션용 환경 변수 목록:
- `SECRET_KEY` (랜덤 생성)
- `DATABASE_URL` (Railway에서 자동 생성)
- `REDIS_URL` (Railway에서 자동 생성)
- `CORS_ORIGINS` (Vercel URL)
- `OPENAI_API_KEY` (선택)
- `ANTHROPIC_API_KEY` (선택)
- `GOOGLE_API_KEY` (선택)

---

## Railway 백엔드 배포

### 1단계: Railway 가입 및 프로젝트 생성

1. https://railway.app 접속
2. "Start a New Project" 클릭
3. GitHub 계정 연동
4. "Deploy from GitHub repo" 선택
5. AgentGuard 저장소 선택

### 2단계: 백엔드 서비스 배포

1. "New" → "Empty Service" 클릭
2. 서비스 이름: `agentguard-backend`
3. Settings → Source:
   - Root Directory: `backend`
   - Build Command: (자동 감지 또는 `pip install -r requirements.txt`)
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### 3단계: PostgreSQL 데이터베이스 추가

1. "New" → "Database" → "Add PostgreSQL"
2. 데이터베이스가 자동으로 생성됨
3. Variables 탭에서 `DATABASE_URL` 자동 생성 확인

### 4단계: Redis 추가 (선택)

1. "New" → "Add Redis"
2. Variables 탭에서 `REDIS_URL` 자동 생성 확인

### 5단계: 환경 변수 설정

Settings → Variables에서 추가:

```
SECRET_KEY=<랜덤_문자열_생성>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
CORS_ORIGINS=https://your-app.vercel.app
DEBUG=false
```

### 6단계: 도메인 설정

1. Settings → Networking
2. "Generate Domain" 클릭
3. 생성된 URL 복사 (예: `agentguard-backend.railway.app`)

---

## Vercel 프론트엔드 배포

### 1단계: Vercel 가입 및 프로젝트 생성

1. https://vercel.com 접속
2. "Add New" → "Project" 클릭
3. GitHub 계정 연동
4. AgentGuard 저장소 선택

### 2단계: 프로젝트 설정

1. Framework Preset: **Next.js** (자동 감지)
2. Root Directory: `frontend`
3. Build Command: `npm run build` (자동)
4. Output Directory: `.next` (자동)
5. Install Command: `npm install` (자동)

### 3단계: 환경 변수 설정

Environment Variables에서 추가:

```
NEXT_PUBLIC_API_URL=https://agentguard-backend.railway.app
```

### 4단계: 배포

1. "Deploy" 클릭
2. 배포 완료 후 URL 확인 (예: `agentguard.vercel.app`)

### 5단계: CORS 업데이트

Railway 백엔드 환경 변수에서:
```
CORS_ORIGINS=https://agentguard.vercel.app
```
업데이트 후 재배포

---

## 배포 설정 파일

### `railway.json` (backend/ 디렉토리)

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pip install -r requirements.txt"
  },
  "deploy": {
    "startCommand": "uvicorn app.main:app --host 0.0.0.0 --port $PORT",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### `Procfile` (backend/ 디렉토리, Railway 대체용)

```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### `vercel.json` (프로젝트 루트)

```json
{
  "buildCommand": "cd frontend && npm run build",
  "outputDirectory": "frontend/.next",
  "installCommand": "cd frontend && npm install",
  "framework": "nextjs",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/"
    }
  ]
}
```

### `.vercelignore` (프로젝트 루트)

```
backend/
sdk/
docker-compose.yml
*.md
.env
```

---

## 배포 후 확인 사항

### 1. 백엔드 확인

```bash
# 헬스 체크
curl https://agentguard-backend.railway.app/health

# API 문서
https://agentguard-backend.railway.app/docs
```

### 2. 프론트엔드 확인

1. https://agentguard.vercel.app 접속
2. 회원가입/로그인 테스트
3. API 연결 확인

### 3. 데이터베이스 확인

Railway 대시보드에서:
- PostgreSQL 연결 상태
- 데이터베이스 크기
- 연결 수

---

## 자동 배포 설정

### GitHub Actions (선택)

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Trigger Railway Deploy
        run: |
          # Railway는 자동으로 배포됨
          echo "Railway will auto-deploy"
  
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Trigger Vercel Deploy
        run: |
          # Vercel은 자동으로 배포됨
          echo "Vercel will auto-deploy"
```

---

## 환경별 설정

### 개발 환경 (로컬)
- `.env` 파일 사용
- Docker Compose
- localhost

### 스테이징 환경 (선택)
- Railway Staging 서비스
- Vercel Preview 배포
- 별도 데이터베이스

### 프로덕션 환경
- Railway Production 서비스
- Vercel Production 배포
- 프로덕션 데이터베이스

---

## 트러블슈팅

### 백엔드 배포 실패

1. 로그 확인: Railway → Deployments → Logs
2. 환경 변수 확인
3. 포트 설정 확인 (`$PORT` 사용)
4. 의존성 설치 확인

### 프론트엔드 배포 실패

1. 빌드 로그 확인: Vercel → Deployments → Build Logs
2. 환경 변수 확인
3. Next.js 설정 확인
4. 의존성 확인

### CORS 오류

1. Railway 환경 변수 `CORS_ORIGINS` 확인
2. Vercel URL이 포함되어 있는지 확인
3. 백엔드 재배포

### 데이터베이스 연결 오류

1. Railway에서 `DATABASE_URL` 확인
2. 데이터베이스 서비스 상태 확인
3. 연결 풀 설정 확인

---

## 비용 모니터링

### Railway
- 대시보드에서 사용량 확인
- 예산 알림 설정
- 크레딧 모니터링

### Vercel
- 대시보드에서 대역폭 확인
- 함수 실행 시간 모니터링
- 예산 알림 설정

---

## 보안 체크리스트

- [ ] `SECRET_KEY` 강력한 랜덤 문자열 사용
- [ ] 환경 변수 Git에 커밋하지 않음
- [ ] HTTPS 사용 (Vercel/Railway 자동)
- [ ] CORS 올바르게 설정
- [ ] API 키 암호화 저장
- [ ] 데이터베이스 접근 제한

---

## 다음 단계

배포 완료 후:
1. 커스텀 도메인 설정 (선택)
2. SSL 인증서 확인 (자동)
3. 모니터링 설정
4. 백업 설정
5. 성능 모니터링


