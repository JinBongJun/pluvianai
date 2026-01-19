# 빠른 시작 가이드

이 프로젝트는 **프로덕션 환경(Vercel + Railway)을 중심으로 개발**합니다.

## 🎯 5분 안에 시작하기

### 1. 코드 변경

```bash
# 코드 수정
git add .
git commit -m "feat: 새로운 기능"
git push origin main
```

### 2. 자동 배포 확인

**프론트엔드 (Vercel):**
- https://vercel.com/dashboard 접속
- 프로젝트 선택 → Deployments 확인
- 배포 완료 후 자동으로 프론트엔드 업데이트

**백엔드 (Railway):**
- https://railway.com/dashboard 접속
- 프로젝트 선택 → Deployments 확인
- 배포 완료 후 자동으로 백엔드 업데이트

### 3. 프로덕션에서 테스트

- Vercel URL 접속
- 기능 테스트
- 문제 발견 시 → 1단계로 돌아가기

**끝!** 🎉

---

## 📊 모니터링 확인

### Vercel Analytics
1. Vercel 대시보드 → 프로젝트 → **Analytics**
2. 실시간 트래픽, 에러, 성능 지표 확인

### Railway Metrics
1. Railway 대시보드 → 프로젝트 → **Metrics**
2. CPU, 메모리, 네트워크 사용량 확인

### 백엔드 Health Check
- `https://your-backend.railway.app/health`
- `https://your-backend.railway.app/metrics`

---

## 🔍 디버깅

### 에러 확인
- **Sentry**: 자동으로 에러 수집 및 알림
- **Vercel Analytics**: 프론트엔드 에러 추적
- **Railway Logs**: 백엔드 로그 확인

### 로그 확인
- **Vercel**: 대시보드 → Deployments → Functions 탭
- **Railway**: 대시보드 → 서비스 → Logs 탭

---

## 💡 팁

1. **작은 변경도 바로 배포**: 프로덕션 환경이 안정적이므로 즉시 확인 가능
2. **모니터링 적극 활용**: Vercel Analytics + Railway Metrics로 실시간 확인
3. **로컬 개발 최소화**: 대부분의 경우 프로덕션에서 직접 작업

---

## 📚 더 알아보기

- [프로덕션 우선 개발 가이드](./PRODUCTION_FIRST_GUIDE.md) - 상세 가이드
- [배포 가이드](./DEPLOYMENT_GUIDE.md) - 배포 설정
- [모니터링 가이드](./MONITORING_GUIDE.md) - 고급 모니터링
