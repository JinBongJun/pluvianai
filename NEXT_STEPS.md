# 다음 단계 가이드

AgentGuard를 배포하고 운영하기 위한 단계별 가이드입니다.

## 🎯 현재 상태

✅ **완료된 작업**
- 모든 핵심 기능 구현
- 최적화 적용 (7가지)
- 배포 설정 파일 준비
- 문서화 완료

## 📋 다음 단계 (순서대로 진행)

### 1단계: Git 커밋 및 GitHub 푸시 (5분)

#### 1.1 Git 커밋
```bash
cd C:\Users\user\Desktop\AgentGuard

# 모든 변경사항 추가
git add .

# 커밋
git commit -m "Initial commit: AgentGuard MVP with optimizations"
```

#### 1.2 GitHub 저장소 생성
1. https://github.com 접속
2. "New repository" 클릭
3. 저장소 이름: `AgentGuard` (또는 원하는 이름)
4. Public 또는 Private 선택
5. "Create repository" 클릭

#### 1.3 GitHub에 푸시
```bash
# 원격 저장소 추가 (GitHub에서 제공하는 URL 사용)
git remote add origin https://github.com/yourusername/AgentGuard.git

# 브랜치 이름 변경
git branch -M main

# 푸시
git push -u origin main
```

---

### 2단계: Railway 백엔드 배포 (10분)

#### 2.1 Railway 가입 및 프로젝트 생성
1. https://railway.app 접속
2. "Start a New Project" 클릭
3. GitHub 계정 연동
4. "Deploy from GitHub repo" 선택
5. `AgentGuard` 저장소 선택

#### 2.2 백엔드 서비스 배포
1. "New" → "Empty Service" 클릭
2. 서비스 이름: `agentguard-backend`
3. Settings → Source:
   - Root Directory: `backend`
   - Build Command: (자동 감지)
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

#### 2.3 PostgreSQL 데이터베이스 추가
1. "New" → "Database" → "Add PostgreSQL"
2. Variables 탭에서 `DATABASE_URL` 자동 생성 확인

#### 2.4 Redis 추가 (선택, 권장)
1. "New" → "Add Redis"
2. Variables 탭에서 `REDIS_URL` 자동 생성 확인

#### 2.5 환경 변수 설정
Settings → Variables에서 추가:

```
SECRET_KEY=<랜덤_문자열_생성_예: openssl rand -hex 32>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
DEBUG=false
```

**중요**: `CORS_ORIGINS`는 Vercel URL을 받은 후 설정

#### 2.6 도메인 생성
1. Settings → Networking
2. "Generate Domain" 클릭
3. 생성된 URL 복사 (예: `agentguard-backend.railway.app`)

---

### 3단계: Vercel 프론트엔드 배포 (5분)

#### 3.1 Vercel 가입 및 프로젝트 생성
1. https://vercel.com 접속
2. "Add New" → "Project" 클릭
3. GitHub 계정 연동
4. `AgentGuard` 저장소 선택

#### 3.2 프로젝트 설정
1. Framework Preset: **Next.js** (자동 감지)
2. Root Directory: `frontend`
3. Build Command: `npm run build` (자동)
4. Output Directory: `.next` (자동)

#### 3.3 환경 변수 설정
Environment Variables에서 추가:

```
NEXT_PUBLIC_API_URL=https://agentguard-backend.railway.app
```
(위에서 받은 Railway URL 사용)

#### 3.4 배포
1. "Deploy" 클릭
2. 배포 완료 후 URL 확인 (예: `agentguard.vercel.app`)

#### 3.5 CORS 업데이트
Railway 백엔드 환경 변수에서:
```
CORS_ORIGINS=https://agentguard.vercel.app
```
업데이트 후 Railway 재배포

---

### 4단계: 테스트 (10분)

#### 4.1 백엔드 테스트
```bash
# 헬스 체크
curl https://agentguard-backend.railway.app/health

# API 문서
https://agentguard-backend.railway.app/docs
```

#### 4.2 프론트엔드 테스트
1. https://agentguard.vercel.app 접속
2. 회원가입 테스트
3. 로그인 테스트
4. 프로젝트 생성 테스트

#### 4.3 통합 테스트
1. Swagger UI에서 API 테스트
2. 프론트엔드에서 전체 플로우 테스트
3. LLM API 프록시 테스트

---

### 5단계: 모니터링 설정 (선택, 권장)

#### 5.1 Sentry 설정 (에러 추적)
1. https://sentry.io 가입
2. 프로젝트 생성
3. DSN을 환경 변수에 추가

#### 5.2 로깅 설정
- Railway 로그 확인
- Vercel 로그 확인

---

## 🚀 빠른 시작 체크리스트

### 필수 작업
- [ ] Git 커밋 및 GitHub 푸시
- [ ] Railway 백엔드 배포
- [ ] PostgreSQL 추가
- [ ] 환경 변수 설정
- [ ] Vercel 프론트엔드 배포
- [ ] CORS 설정 업데이트
- [ ] 기본 테스트

### 선택 작업
- [ ] Redis 추가
- [ ] Sentry 설정
- [ ] 커스텀 도메인 설정
- [ ] 모니터링 대시보드

---

## 💰 예상 비용

### 초기 (0-200명)
- **Vercel**: 무료
- **Railway**: $5-20/월
- **총 비용**: $5-20/월

### 성장 (200-500명)
- **Vercel Pro**: $20/월
- **Railway**: $20-50/월
- **총 비용**: $40-70/월

---

## ⚠️ 주의사항

### 보안
1. **SECRET_KEY**: 강력한 랜덤 문자열 사용
   ```bash
   openssl rand -hex 32
   ```

2. **환경 변수**: Git에 커밋하지 않음 (이미 .gitignore에 포함)

3. **CORS**: 프로덕션 URL만 허용

### 성능
1. **데이터 아카이빙**: 정기적으로 실행
   ```bash
   POST /api/v1/archive/archive
   ```

2. **모니터링**: 저장 공간 사용량 확인
   ```bash
   GET /api/v1/archive/stats
   ```

---

## 🆘 문제 해결

### 배포 실패 시
1. Railway 로그 확인: Deployments → Logs
2. Vercel 빌드 로그 확인: Deployments → Build Logs
3. 환경 변수 확인
4. 포트 설정 확인 (`$PORT` 사용)

### CORS 오류 시
1. Railway 환경 변수 `CORS_ORIGINS` 확인
2. Vercel URL이 포함되어 있는지 확인
3. 백엔드 재배포

### 데이터베이스 연결 오류 시
1. Railway에서 `DATABASE_URL` 확인
2. 데이터베이스 서비스 상태 확인
3. 연결 풀 설정 확인

---

## 📞 다음 단계

배포 완료 후:
1. ✅ 기본 기능 테스트
2. ✅ 실제 사용자 테스트
3. ✅ 피드백 수집
4. ✅ 성능 모니터링
5. ✅ 필요시 추가 최적화

---

## 🎉 성공 기준

배포가 성공적으로 완료되면:
- ✅ 백엔드 API 정상 작동
- ✅ 프론트엔드 접속 가능
- ✅ 회원가입/로그인 가능
- ✅ 프로젝트 생성 가능
- ✅ API 호출 캡처 가능

**축하합니다! AgentGuard가 프로덕션에 배포되었습니다!** 🚀



