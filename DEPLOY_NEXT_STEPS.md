# 🎉 GitHub 푸시 완료!

## ✅ 완료된 작업
- Git 커밋 완료 (108개 파일)
- GitHub 저장소 생성 완료
- GitHub 푸시 완료

저장소 URL: https://github.com/JinBongJun/AgentGuard

---

## 🚀 다음 단계: 배포

### Step 1: Railway 백엔드 배포 (약 5분)

1. **Railway 접속**: https://railway.app
2. **"Start a New Project"** 클릭
3. **GitHub 연동** → "Deploy from GitHub repo" 선택
4. **AgentGuard 저장소 선택**
5. **"New" → "Empty Service"** 클릭
   - 서비스 이름: `agentguard-backend` (또는 원하는 이름)
   - Settings → Source:
     - Root Directory: `backend`
     - Build Command: (자동 감지)
     - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. **"New" → "Database" → "Add PostgreSQL"** 클릭
   - `DATABASE_URL` 자동 생성됨
7. **"New" → "Add Redis"** 클릭 (선택, 권장)
   - `REDIS_URL` 자동 생성됨
8. **Settings → Variables**에서 환경 변수 추가:
   ```
   SECRET_KEY=<랜덤_문자열_생성>
   DEBUG=false
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   REFRESH_TOKEN_EXPIRE_DAYS=7
   ```
   **SECRET_KEY 생성 방법**:
   - 온라인: https://randomkeygen.com/ (256-bit WEP Key 사용)
   - 또는: `openssl rand -hex 32` (터미널에서)
9. **Settings → Networking → "Generate Domain"** 클릭
   - 생성된 URL 복사 (예: `agentguard-backend.railway.app`)
   - 이 URL을 메모해두세요!

### Step 2: 데이터베이스 초기화 (30초)

Railway 배포 완료 후:

1. 브라우저에서 접속:
   ```
   https://your-backend-url.railway.app/api/v1/admin/init-db
   ```
   또는
2. API 문서에서:
   ```
   https://your-backend-url.railway.app/docs
   ```
   → `/api/v1/admin/init-db` 엔드포인트 찾아서 실행

### Step 3: Vercel 프론트엔드 배포 (약 3분)

1. **Vercel 접속**: https://vercel.com
2. **"Add New" → "Project"** 클릭
3. **GitHub 연동** → AgentGuard 저장소 선택
4. **프로젝트 설정**:
   - Root Directory: `frontend`
   - Framework Preset: Next.js (자동 감지)
   - Build Command: `npm run build` (자동)
   - Output Directory: `.next` (자동)
5. **Environment Variables** 추가:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app
   ```
   (Railway에서 복사한 백엔드 URL 사용)
6. **"Deploy"** 클릭
7. 배포 완료 후 URL 확인 (예: `agentguard.vercel.app`)

### Step 4: CORS 업데이트 (30초)

1. Railway로 돌아가기
2. Settings → Variables에서:
   ```
   CORS_ORIGINS=https://your-vercel-url.vercel.app
   ```
   추가 (Vercel URL 사용)
3. Railway에서 **"Redeploy"** 클릭

---

## ✅ 배포 확인

### 백엔드
- API 문서: `https://your-backend.railway.app/docs`
- Health check: `https://your-backend.railway.app/health`

### 프론트엔드
- 홈페이지: `https://your-app.vercel.app`
- 회원가입/로그인 테스트

---

## 🆘 문제 해결

### Railway 배포 실패
- Railway → Deployments → Logs 확인
- 환경 변수 확인
- `DATABASE_URL` 자동 생성 확인

### Vercel 배포 실패
- Vercel → Deployments → Build Logs 확인
- `NEXT_PUBLIC_API_URL` 확인

### CORS 오류
- Railway `CORS_ORIGINS`에 Vercel URL 포함 확인
- 백엔드 재배포

---

## 📝 참고

자세한 배포 가이드:
- `QUICK_DEPLOY.md` - 빠른 배포 가이드
- `DEPLOYMENT_GUIDE.md` - 상세 배포 가이드

