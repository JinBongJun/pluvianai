# 프로덕션 우선 개발 가이드

이 프로젝트는 **프로덕션 환경(Vercel + Railway)을 중심으로 개발**합니다.

## 🎯 개발 환경 전략

### 프로덕션 환경 (기본)
- **프론트엔드**: Vercel 자동 배포
- **백엔드**: Railway 자동 배포
- **데이터베이스**: Railway PostgreSQL
- **모니터링**: Railway/Vercel 통합 모니터링

### 로컬 개발 환경 (선택사항)
- 빠른 반복이 필요할 때만 사용
- 디버깅이 필요할 때만 사용

---

## 🚀 빠른 시작 (프로덕션 중심)

### 1. 코드 변경 → 자동 배포

```bash
# 코드 수정
git add .
git commit -m "feat: 새로운 기능 추가"
git push origin main
```

**자동으로:**
- ✅ GitHub Actions가 테스트 실행
- ✅ Vercel이 프론트엔드 자동 배포
- ✅ Railway가 백엔드 자동 배포

### 2. 배포 확인

**프론트엔드:**
- Vercel 대시보드: https://vercel.com/dashboard
- 배포 완료 후 자동으로 프론트엔드 업데이트

**백엔드:**
- Railway 대시보드: https://railway.com/dashboard
- 배포 완료 후 자동으로 백엔드 업데이트

### 3. 모니터링 확인

**Vercel:**
- 대시보드 → 프로젝트 → Analytics
- 실시간 트래픽, 에러, 성능 지표

**Railway:**
- 대시보드 → 서비스 → Metrics
- CPU, 메모리, 네트워크 사용량

---

## 📊 모니터링 접근 방법

### Vercel 모니터링
1. Vercel 대시보드 접속
2. 프로젝트 선택
3. **Analytics** 탭:
   - 실시간 트래픽
   - 에러 로그
   - 성능 지표 (Core Web Vitals)
   - 사용자 세션

### Railway 모니터링
1. Railway 대시보드 접속
2. 프로젝트 선택
3. **Metrics** 탭:
   - CPU 사용량
   - 메모리 사용량
   - 네트워크 트래픽
   - 로그 스트림

### 백엔드 메트릭 엔드포인트
- **Health Check**: `https://your-backend.railway.app/health`
- **Metrics**: `https://your-backend.railway.app/metrics` (Prometheus 형식)

---

## 🔄 배포 워크플로우

### 일반적인 개발 흐름

1. **코드 작성**
   ```bash
   # 로컬에서 코드 작성 (선택사항)
   # 또는 GitHub 웹 에디터 사용
   ```

2. **커밋 & 푸시**
   ```bash
   git add .
   git commit -m "feat: 새로운 기능"
   git push origin main
   ```

3. **자동 배포 확인**
   - GitHub Actions: 테스트 실행
   - Vercel: 프론트엔드 배포
   - Railway: 백엔드 배포

4. **프로덕션에서 테스트**
   - Vercel URL 접속
   - 기능 테스트
   - 문제 발견 시 → 1단계로 돌아가기

### 핫픽스 (긴급 수정)

1. **코드 수정**
2. **즉시 커밋 & 푸시**
   ```bash
   git commit -m "hotfix: 긴급 수정"
   git push origin main
   ```
3. **배포 완료 대기** (보통 1-2분)
4. **프로덕션에서 확인**

---

## 🛠️ 로컬 개발 환경 (선택사항)

로컬 개발이 필요한 경우에만 사용:

### 프론트엔드만 로컬 실행
```bash
cd frontend
npm install
npm run dev
# http://localhost:3000 접속
# 백엔드는 Railway 사용
```

### 백엔드만 로컬 실행
```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1  # Windows
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
# http://localhost:8000 접속
# DB는 Railway 사용 (터널링 필요)
```

**참고:** 로컬 개발은 선택사항이며, 대부분의 경우 프로덕션 환경에서 직접 작업하는 것이 더 효율적입니다.

---

## 📝 환경 변수 관리

### Vercel 환경 변수
1. Vercel 대시보드 → 프로젝트 → Settings → Environment Variables
2. 필요한 변수 추가:
   - `NEXT_PUBLIC_API_URL`: Railway 백엔드 URL
   - `NEXT_PUBLIC_POSTHOG_KEY`: PostHog 키
   - 기타 프론트엔드 변수

### Railway 환경 변수
1. Railway 대시보드 → 프로젝트 → Variables
2. 필요한 변수 추가:
   - `DATABASE_URL`: PostgreSQL 연결 문자열
   - `SECRET_KEY`: 보안 키
   - `OPENAI_API_KEY`: LLM API 키
   - 기타 백엔드 변수

---

## 🔍 디버깅

### Vercel 로그 확인
1. Vercel 대시보드 → 프로젝트 → Deployments
2. 배포 선택 → **Functions** 탭
3. 함수 로그 확인

### Railway 로그 확인
1. Railway 대시보드 → 프로젝트 → 서비스
2. **Logs** 탭에서 실시간 로그 확인
3. 또는 터미널에서:
   ```bash
   railway logs
   ```

### 에러 추적
- **Sentry**: 자동으로 에러 수집 및 알림
- **Vercel Analytics**: 프론트엔드 에러 추적
- **Railway Metrics**: 백엔드 에러 추적

---

## 🎯 모니터링 대시보드

### 통합 모니터링 (권장)
프로덕션 환경에서는 다음을 사용:

1. **Vercel Analytics**
   - 프론트엔드 성능
   - 사용자 행동 분석
   - 에러 추적

2. **Railway Metrics**
   - 백엔드 성능
   - 리소스 사용량
   - 로그 스트림

3. **Sentry**
   - 에러 추적 및 알림
   - 성능 모니터링

### 고급 모니터링 (선택사항)
더 상세한 모니터링이 필요한 경우:
- Prometheus + Grafana (별도 설정 필요)
- DataDog, New Relic 등 상용 서비스

---

## ✅ 체크리스트

### 새 기능 개발 시
- [ ] 코드 작성
- [ ] 로컬 테스트 (선택사항)
- [ ] 커밋 & 푸시
- [ ] 자동 배포 확인
- [ ] 프로덕션에서 테스트
- [ ] 모니터링 확인

### 버그 수정 시
- [ ] 문제 확인 (Sentry/Vercel 로그)
- [ ] 코드 수정
- [ ] 커밋 & 푸시
- [ ] 프로덕션에서 확인
- [ ] 모니터링으로 해결 확인

---

## 💡 팁

1. **작은 변경사항도 바로 배포**
   - 프로덕션 환경이 안정적이므로 작은 변경도 바로 배포 가능
   - 자동 배포가 빠르므로 (1-2분) 즉시 확인 가능

2. **모니터링을 적극 활용**
   - Vercel Analytics로 사용자 행동 확인
   - Railway Metrics로 백엔드 성능 확인
   - Sentry로 에러 즉시 파악

3. **로컬 개발은 최소화**
   - 대부분의 경우 프로덕션에서 직접 작업
   - 로컬은 복잡한 디버깅이 필요할 때만 사용

4. **자동화 활용**
   - GitHub Actions로 테스트 자동 실행
   - Dependabot으로 의존성 자동 업데이트
   - Vercel/Railway로 자동 배포

---

## 🚨 문제 해결

### 배포 실패 시
1. **Vercel 배포 실패**
   - 대시보드 → Deployments → 실패한 배포 확인
   - 빌드 로그 확인
   - 에러 수정 후 재배포

2. **Railway 배포 실패**
   - 대시보드 → Deployments → 실패한 배포 확인
   - 로그 확인
   - 에러 수정 후 재배포

### 성능 문제 시
1. **Vercel Analytics**에서 성능 지표 확인
2. **Railway Metrics**에서 리소스 사용량 확인
3. 필요시 스케일 업 또는 최적화

---

## 📚 관련 문서

- [배포 가이드](./DEPLOYMENT_GUIDE.md)
- [모니터링 가이드](./MONITORING_GUIDE.md)
- [자동화 가이드](./AUTOMATION_GUIDE.md)
