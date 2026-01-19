# 모니터링 빠른 접근 가이드

프로덕션 환경에서 모니터링을 확인하는 가장 빠른 방법입니다.

## 🎯 1분 안에 확인하기

### Vercel 모니터링 (프론트엔드)

**접근 방법:**
1. https://vercel.com/dashboard 접속
2. **AgentGuard** 프로젝트 클릭
3. 상단 탭에서 확인:
   - **Analytics**: 트래픽, 사용자, 성능
   - **Deployments**: 배포 상태 및 로그
   - **Functions**: 서버리스 함수 로그

**주요 지표:**
- 실시간 트래픽
- 페이지뷰
- 에러 발생 수
- Core Web Vitals (성능)

---

### Railway 모니터링 (백엔드)

**접근 방법:**
1. https://railway.com/dashboard 접속
2. **AgentGuard** 프로젝트 클릭
3. **Backend** 서비스 클릭
4. 상단 탭에서 확인:
   - **Metrics**: CPU, 메모리, 네트워크
   - **Logs**: 실시간 로그 스트림
   - **Deployments**: 배포 상태

**주요 지표:**
- CPU 사용률
- 메모리 사용량
- 네트워크 트래픽
- 실시간 로그

---

### 백엔드 Health Check

**직접 확인:**
```
https://your-backend.railway.app/health
```

**응답 예시:**
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "database": "connected",
  "redis": "connected"
}
```

**Prometheus 메트릭:**
```
https://your-backend.railway.app/metrics
```

---

## 📊 일일 체크리스트

### 아침 (9시)
- [ ] Vercel Analytics에서 전날 트래픽 확인
- [ ] Railway Metrics에서 리소스 사용량 확인
- [ ] Sentry에서 새로운 에러 확인 (있다면)

### 점심 (12시)
- [ ] Vercel Analytics에서 실시간 트래픽 확인
- [ ] Railway Metrics에서 CPU/메모리 확인

### 저녁 (6시)
- [ ] Sentry에서 오늘 발생한 에러 확인
- [ ] Vercel Analytics에서 오늘의 성능 확인

---

## 🔍 상세 확인 방법

### Vercel Analytics 상세

**접근:**
1. Vercel 대시보드 → 프로젝트 → **Analytics** 탭

**확인할 항목:**
- **Overview**: 전체 트래픽 및 성능 개요
- **Performance**: 페이지 로드 시간, Core Web Vitals
- **Errors**: 프론트엔드 에러 추적
- **Sessions**: 사용자 세션 분석

**주요 지표:**
- **Pageviews**: 페이지뷰 수
- **Unique Visitors**: 고유 방문자 수
- **Bounce Rate**: 이탈률
- **Avg. Session Duration**: 평균 세션 시간

---

### Railway Metrics 상세

**접근:**
1. Railway 대시보드 → 프로젝트 → Backend 서비스 → **Metrics** 탭

**확인할 항목:**
- **CPU**: CPU 사용률 그래프
- **Memory**: 메모리 사용량 그래프
- **Network**: 네트워크 트래픽 그래프

**주요 지표:**
- **CPU Usage**: CPU 사용률 (%)
- **Memory Usage**: 메모리 사용량 (MB)
- **Network I/O**: 네트워크 입출력 (MB/s)

---

### Railway Logs 상세

**접근:**
1. Railway 대시보드 → 프로젝트 → Backend 서비스 → **Logs** 탭

**확인할 항목:**
- 실시간 로그 스트림
- 에러 메시지
- API 요청 로그
- 데이터베이스 쿼리 로그

**필터링:**
- 에러만 보기: `[err]` 검색
- 정보만 보기: `[inf]` 검색
- 특정 키워드 검색

---

## 🚨 에러 확인

### Sentry (에러 추적)

**접근:**
1. https://sentry.io 접속
2. **AgentGuard** 프로젝트 선택
3. **Issues** 탭에서 에러 확인

**확인할 항목:**
- 새로운 에러 발생 여부
- 에러 발생 빈도
- 에러 발생 위치
- 스택 트레이스

**알림 설정:**
- 이메일 알림
- Slack 통합
- Discord 통합

---

### Vercel 에러 로그

**접근:**
1. Vercel 대시보드 → 프로젝트 → **Deployments**
2. 배포 선택 → **Functions** 탭
3. 함수 로그 확인

**확인할 항목:**
- 함수 실행 로그
- 에러 메시지
- 실행 시간

---

### Railway 에러 로그

**접근:**
1. Railway 대시보드 → 프로젝트 → Backend 서비스 → **Logs**
2. `[err]` 검색

**확인할 항목:**
- 에러 메시지
- 스택 트레이스
- 에러 발생 시간

---

## 📈 성능 모니터링

### Core Web Vitals (Vercel)

**접근:**
1. Vercel 대시보드 → 프로젝트 → **Analytics** → **Performance**

**확인할 지표:**
- **LCP (Largest Contentful Paint)**: 페이지 로드 성능
  - 목표: < 2.5초
- **FID (First Input Delay)**: 상호작용 반응성
  - 목표: < 100ms
- **CLS (Cumulative Layout Shift)**: 시각적 안정성
  - 목표: < 0.1

---

### 백엔드 성능 (Railway)

**접근:**
1. Railway 대시보드 → 프로젝트 → Backend 서비스 → **Metrics**

**확인할 지표:**
- **CPU Usage**: CPU 사용률
  - 정상: < 70%
  - 경고: 70-90%
  - 위험: > 90%
- **Memory Usage**: 메모리 사용량
  - 정상: < 80%
  - 경고: 80-95%
  - 위험: > 95%

---

## 🔗 빠른 링크

### Vercel
- 대시보드: https://vercel.com/dashboard
- Analytics: 프로젝트 → Analytics 탭
- Deployments: 프로젝트 → Deployments 탭

### Railway
- 대시보드: https://railway.com/dashboard
- Metrics: 프로젝트 → Backend 서비스 → Metrics 탭
- Logs: 프로젝트 → Backend 서비스 → Logs 탭

### Sentry
- 대시보드: https://sentry.io
- Issues: 프로젝트 → Issues 탭
- Performance: 프로젝트 → Performance 탭

---

## 💡 모니터링 팁

1. **북마크 활용**: 자주 확인하는 페이지를 북마크에 추가
2. **알림 설정**: 중요한 이벤트에 대한 알림 설정
3. **정기 확인**: 매일 아침/저녁 체크
4. **트렌드 분석**: 주간/월간 트렌드 확인

---

## 📚 관련 문서

- [프로덕션 모니터링 가이드](./PRODUCTION_MONITORING.md) - 상세 가이드
- [프로덕션 우선 개발 가이드](./PRODUCTION_FIRST_GUIDE.md) - 전체 가이드
