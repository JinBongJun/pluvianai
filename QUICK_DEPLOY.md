# 빠른 배포 가이드

## 🚀 5분 안에 배포하기

### 1단계: Git 커밋 및 푸시 (2분)

```bash
# 모든 변경사항 추가
git add .

# 커밋
git commit -m "Initial commit: AgentGuard MVP"

# GitHub 저장소 생성 후 (https://github.com/new)
git remote add origin https://github.com/YOUR_USERNAME/AgentGuard.git
git branch -M main
git push -u origin main
```

### 2단계: Railway 백엔드 배포 (2분)

1. **Railway 접속**: https://railway.app
2. **"Start a New Project"** → GitHub 연동
3. **AgentGuard 저장소 선택**
4. **"New" → "Empty Service"**
   - Root Directory: `backend`
5. **"New" → "Database" → "Add PostgreSQL"**
6. **"New" → "Add Redis"** (선택)
7. **Settings → Variables 추가**:
   ```
   SECRET_KEY=<랜덤_문자열_생성>
   DEBUG=false
   ```
   SECRET_KEY 생성: `openssl rand -hex 32` 또는 온라인 생성기 사용
8. **Settings → Networking → "Generate Domain"**
   - URL 복사 (예: `agentguard-backend.railway.app`)

### 3단계: 데이터베이스 초기화 (30초)

배포 완료 후:

```bash
# 브라우저에서 또는 curl로
curl -X POST https://your-backend.railway.app/api/v1/admin/init-db
```

또는 브라우저에서:
```
https://your-backend.railway.app/api/v1/admin/init-db
```

### 4단계: Vercel 프론트엔드 배포 (1분)

1. **Vercel 접속**: https://vercel.com
2. **"Add New" → "Project"**
3. **AgentGuard 저장소 선택**
4. **프로젝트 설정**:
   - Root Directory: `frontend`
   - Framework: Next.js (자동 감지)
5. **Environment Variables**:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.railway.app
   ```
6. **"Deploy"** 클릭
7. **배포 완료 후 URL 확인** (예: `agentguard.vercel.app`)

### 5단계: CORS 업데이트 (30초)

Railway 환경 변수에서:
```
CORS_ORIGINS=https://your-app.vercel.app
```

업데이트 후 Railway에서 **"Redeploy"** 클릭

---

## ✅ 배포 확인

### 백엔드
- API 문서: `https://your-backend.railway.app/docs`
- Health: `https://your-backend.railway.app/health` (없으면 `/docs` 확인)

### 프론트엔드
- 홈페이지: `https://your-app.vercel.app`
- 회원가입/로그인 테스트

---

## 🔒 보안 주의사항

배포 후 **반드시**:
1. `/api/v1/admin/init-db` 엔드포인트 제거 또는 보안 추가
2. `SECRET_KEY` 강력한 값 사용 확인
3. 환경 변수 Git에 커밋하지 않았는지 확인

---

## 🆘 문제 해결

### 백엔드 배포 실패
- Railway → Deployments → Logs 확인
- 환경 변수 확인
- `DATABASE_URL` 자동 생성 확인

### 프론트엔드 배포 실패
- Vercel → Deployments → Build Logs 확인
- `NEXT_PUBLIC_API_URL` 확인

### CORS 오류
- Railway `CORS_ORIGINS`에 Vercel URL 포함 확인
- 백엔드 재배포

### 데이터베이스 연결 오류
- Railway에서 `DATABASE_URL` 확인
- PostgreSQL 서비스 상태 확인


