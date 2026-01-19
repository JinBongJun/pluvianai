# 배포 워크플로우 가이드

이 프로젝트는 **완전 자동화된 배포 시스템**을 사용합니다.

## 🚀 자동 배포 프로세스

### 1. 코드 푸시

```bash
git add .
git commit -m "feat: 새로운 기능"
git push origin main
```

### 2. 자동 실행되는 작업

**GitHub Actions (CI/CD):**
1. ✅ 코드 품질 검사 (Black, Flake8, ESLint)
2. ✅ 타입 체크 (MyPy, TypeScript)
3. ✅ 테스트 실행 (Unit + Integration)
4. ✅ 보안 스캔
5. ✅ OpenAPI 스키마 검증

**Vercel (프론트엔드):**
1. ✅ 자동 빌드 시작
2. ✅ 의존성 설치
3. ✅ Next.js 빌드
4. ✅ 프로덕션 배포
5. ✅ Preview URL 생성 (PR의 경우)

**Railway (백엔드):**
1. ✅ 자동 빌드 시작
2. ✅ 의존성 설치
3. ✅ FastAPI 앱 시작
4. ✅ Health check 확인
5. ✅ 프로덕션 배포

### 3. 배포 완료

**일반적으로 1-2분 내 완료:**
- 프론트엔드: Vercel URL에서 즉시 확인 가능
- 백엔드: Railway URL에서 즉시 확인 가능

---

## 📋 배포 상태 확인

### Vercel 배포 확인

1. **대시보드 확인:**
   - https://vercel.com/dashboard 접속
   - 프로젝트 선택
   - **Deployments** 탭에서 배포 상태 확인

2. **배포 상태:**
   - 🟢 **Ready**: 배포 완료
   - 🟡 **Building**: 빌드 중
   - 🔴 **Error**: 배포 실패

3. **빌드 로그 확인:**
   - 배포 클릭 → **Build Logs** 탭
   - 에러 발생 시 로그 확인

### Railway 배포 확인

1. **대시보드 확인:**
   - https://railway.com/dashboard 접속
   - 프로젝트 선택
   - 백엔드 서비스 클릭
   - **Deployments** 탭에서 배포 상태 확인

2. **배포 상태:**
   - 🟢 **Active**: 배포 완료
   - 🟡 **Building**: 빌드 중
   - 🔴 **Failed**: 배포 실패

3. **빌드 로그 확인:**
   - 배포 클릭 → **Logs** 탭
   - 에러 발생 시 로그 확인

---

## 🔄 배포 전략

### Main 브랜치 (프로덕션)

**자동 배포:**
- `main` 브랜치에 푸시 → 즉시 프로덕션 배포
- 모든 테스트 통과 후 배포
- 배포 실패 시 자동 롤백

**사용 시나리오:**
- 프로덕션에 바로 반영할 변경사항
- 핫픽스
- 안정적인 기능 추가

### Pull Request (Preview)

**Preview 배포:**
- PR 생성 → Preview 환경 자동 생성
- Vercel: Preview URL 자동 생성
- Railway: Preview 환경 자동 생성

**사용 시나리오:**
- 기능 개발 중 테스트
- 코드 리뷰 전 확인
- 스테이징 테스트

---

## 🚨 배포 실패 처리

### Vercel 배포 실패

**원인 파악:**
1. 대시보드 → Deployments → 실패한 배포 클릭
2. **Build Logs** 확인
3. 에러 메시지 확인

**일반적인 원인:**
- 빌드 에러 (TypeScript, ESLint)
- 의존성 설치 실패
- 환경 변수 누락

**해결 방법:**
1. 에러 수정
2. 커밋 & 푸시
3. 자동 재배포 확인

### Railway 배포 실패

**원인 파악:**
1. 대시보드 → Deployments → 실패한 배포 클릭
2. **Logs** 확인
3. 에러 메시지 확인

**일반적인 원인:**
- Python 구문 에러
- 의존성 설치 실패
- 데이터베이스 연결 실패

**해결 방법:**
1. 에러 수정
2. 커밋 & 푸시
3. 자동 재배포 확인

---

## 🔧 환경 변수 관리

### Vercel 환경 변수

**설정 방법:**
1. Vercel 대시보드 → 프로젝트 → Settings
2. **Environment Variables** 섹션
3. 변수 추가:
   - `NEXT_PUBLIC_API_URL`: Railway 백엔드 URL
   - `NEXT_PUBLIC_POSTHOG_KEY`: PostHog 키
   - 기타 프론트엔드 변수

**환경별 설정:**
- **Production**: 프로덕션 환경
- **Preview**: Preview 환경 (PR)
- **Development**: 로컬 개발 환경

### Railway 환경 변수

**설정 방법:**
1. Railway 대시보드 → 프로젝트
2. **Variables** 탭
3. 변수 추가:
   - `DATABASE_URL`: PostgreSQL 연결 문자열
   - `SECRET_KEY`: 보안 키
   - `OPENAI_API_KEY`: LLM API 키
   - 기타 백엔드 변수

**환경별 설정:**
- **Production**: 프로덕션 환경
- **Preview**: Preview 환경 (PR)

---

## 📊 배포 메트릭

### 배포 시간

**일반적인 배포 시간:**
- 프론트엔드: 1-2분
- 백엔드: 1-2분
- 전체: 2-4분

**최적화 팁:**
- 작은 변경사항은 빠르게 배포
- 큰 변경사항은 PR로 먼저 테스트

### 배포 빈도

**권장 빈도:**
- 하루에 여러 번 배포 가능
- 작은 변경도 즉시 배포 권장
- 프로덕션 환경이 안정적이므로 자주 배포 가능

---

## 🎯 배포 체크리스트

### 배포 전

- [ ] 코드 변경사항 확인
- [ ] 로컬 테스트 (선택사항)
- [ ] 커밋 메시지 작성
- [ ] 브랜치 확인 (`main` 또는 PR)

### 배포 중

- [ ] GitHub Actions 상태 확인
- [ ] Vercel 빌드 상태 확인
- [ ] Railway 빌드 상태 확인

### 배포 후

- [ ] 프로덕션에서 기능 테스트
- [ ] 모니터링 확인 (Vercel Analytics, Railway Metrics)
- [ ] 에러 확인 (Sentry)
- [ ] 성능 확인 (Core Web Vitals)

---

## 💡 배포 팁

1. **작은 변경도 바로 배포**: 프로덕션 환경이 안정적이므로 즉시 확인 가능
2. **PR로 먼저 테스트**: 큰 변경사항은 PR로 Preview 환경에서 먼저 테스트
3. **모니터링 적극 활용**: 배포 후 즉시 모니터링으로 확인
4. **자동화 신뢰**: 자동 배포 시스템을 신뢰하고 활용

---

## 📚 관련 문서

- [프로덕션 우선 개발 가이드](./PRODUCTION_FIRST_GUIDE.md)
- [빠른 시작 가이드](./QUICK_START.md)
- [프로덕션 모니터링 가이드](./PRODUCTION_MONITORING.md)
