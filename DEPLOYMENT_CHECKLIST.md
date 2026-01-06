# AgentGuard 배포 체크리스트

## ✅ 배포 전 확인 사항

### 1. 코드 준비
- [x] 모든 기능 구현 완료
- [x] 최적화 적용 완료
- [x] 에러 처리 개선 완료
- [ ] Git 커밋 완료
- [ ] GitHub 푸시 완료

### 2. 데이터베이스 초기화
- [ ] 데이터베이스 테이블 생성 코드 확인
- [ ] 마이그레이션 또는 초기화 스크립트 준비

### 3. 환경 변수 준비
- [ ] SECRET_KEY 생성 (랜덤 문자열)
- [ ] DATABASE_URL (Railway에서 자동 생성)
- [ ] REDIS_URL (Railway에서 자동 생성)
- [ ] CORS_ORIGINS (Vercel URL)
- [ ] NEXT_PUBLIC_API_URL (Railway 백엔드 URL)

### 4. 배포 플랫폼 계정
- [ ] GitHub 계정
- [ ] Railway 계정
- [ ] Vercel 계정

---

## 🚀 배포 단계

### Step 1: Git 커밋 및 GitHub 푸시

```bash
# 1. 모든 변경사항 추가
git add .

# 2. 커밋
git commit -m "Initial commit: AgentGuard MVP with all features and optimizations"

# 3. GitHub 저장소 생성 후
git remote add origin https://github.com/YOUR_USERNAME/AgentGuard.git
git branch -M main
git push -u origin main
```

### Step 2: Railway 백엔드 배포

1. **Railway 가입 및 프로젝트 생성**
   - https://railway.app 접속
   - "Start a New Project" → GitHub 연동
   - AgentGuard 저장소 선택

2. **백엔드 서비스 배포**
   - "New" → "Empty Service"
   - Root Directory: `backend`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

3. **PostgreSQL 추가**
   - "New" → "Database" → "Add PostgreSQL"
   - `DATABASE_URL` 자동 생성 확인

4. **Redis 추가** (권장)
   - "New" → "Add Redis"
   - `REDIS_URL` 자동 생성 확인

5. **환경 변수 설정**
   ```
   SECRET_KEY=<랜덤_문자열>
   ALGORITHM=HS256
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   REFRESH_TOKEN_EXPIRE_DAYS=7
   DEBUG=false
   CORS_ORIGINS=https://your-app.vercel.app (나중에 업데이트)
   ```

6. **도메인 생성**
   - Settings → Networking → "Generate Domain"
   - URL 복사 (예: `agentguard-backend.railway.app`)

### Step 3: 데이터베이스 초기화

Railway 배포 후, 데이터베이스 테이블을 생성해야 합니다.

**옵션 1: 임시로 create_all 활성화**
- `backend/app/main.py`에서 주석 해제
- 배포 후 다시 주석 처리

**옵션 2: API 엔드포인트로 초기화** (권장)
- `/api/v1/admin/init-db` 엔드포인트 생성 (임시)

### Step 4: Vercel 프론트엔드 배포

1. **Vercel 가입 및 프로젝트 생성**
   - https://vercel.com 접속
   - "Add New" → "Project"
   - GitHub 연동 → AgentGuard 저장소 선택

2. **프로젝트 설정**
   - Framework Preset: Next.js
   - Root Directory: `frontend`
   - Build Command: `npm run build` (자동)
   - Output Directory: `.next` (자동)

3. **환경 변수 설정**
   ```
   NEXT_PUBLIC_API_URL=https://agentguard-backend.railway.app
   ```

4. **배포**
   - "Deploy" 클릭
   - 배포 완료 후 URL 확인 (예: `agentguard.vercel.app`)

5. **CORS 업데이트**
   - Railway 환경 변수에서 `CORS_ORIGINS` 업데이트
   - Vercel URL 추가
   - 백엔드 재배포

---

## 🔍 배포 후 확인

### 백엔드 확인
- [ ] Health check: `https://your-backend.railway.app/health`
- [ ] API 문서: `https://your-backend.railway.app/docs`
- [ ] 데이터베이스 연결 확인

### 프론트엔드 확인
- [ ] 홈페이지 접속 확인
- [ ] 회원가입/로그인 테스트
- [ ] API 연결 확인

---

## ⚠️ 주의사항

1. **SECRET_KEY**: 반드시 강력한 랜덤 문자열 사용
2. **환경 변수**: Git에 커밋하지 않기
3. **데이터베이스**: 초기화 후 테이블 생성 확인
4. **CORS**: 프론트엔드 URL이 백엔드 CORS에 포함되어야 함
