# 프로덕션 모니터링 가이드

이 프로젝트는 **Vercel Analytics**와 **Railway Metrics**를 사용하여 프로덕션 환경을 모니터링합니다.

## 🎯 통합 모니터링

### Vercel Analytics (프론트엔드)

**자동으로 수집되는 지표:**
- ✅ 실시간 트래픽
- ✅ 사용자 세션
- ✅ 페이지뷰
- ✅ 에러 로그
- ✅ 성능 지표 (Core Web Vitals)
- ✅ 지리적 분포

**접근 방법:**
1. Vercel 대시보드 접속: https://vercel.com/dashboard
2. 프로젝트 선택
3. **Analytics** 탭 클릭
4. 실시간 데이터 확인

**주요 기능:**
- **Overview**: 전체 트래픽 및 성능 개요
- **Performance**: 페이지 로드 시간, Core Web Vitals
- **Errors**: 프론트엔드 에러 추적
- **Sessions**: 사용자 세션 분석

---

### Railway Metrics (백엔드)

**자동으로 수집되는 지표:**
- ✅ CPU 사용량
- ✅ 메모리 사용량
- ✅ 네트워크 트래픽
- ✅ 디스크 사용량
- ✅ 로그 스트림

**접근 방법:**
1. Railway 대시보드 접속: https://railway.com/dashboard
2. 프로젝트 선택
3. 백엔드 서비스 클릭
4. **Metrics** 탭 클릭
5. 실시간 메트릭 확인

**주요 기능:**
- **CPU**: CPU 사용률 그래프
- **Memory**: 메모리 사용량 그래프
- **Network**: 네트워크 트래픽 그래프
- **Logs**: 실시간 로그 스트림

---

## 🔍 백엔드 메트릭 엔드포인트

### Health Check
```
GET https://your-backend.railway.app/health
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

### Prometheus Metrics
```
GET https://your-backend.railway.app/metrics
```

**수집되는 메트릭:**
- `http_requests_total`: 총 HTTP 요청 수
- `http_request_duration_seconds`: 요청 처리 시간
- `http_requests_in_progress`: 진행 중인 요청 수
- `llm_api_calls_total`: LLM API 호출 수
- `llm_api_call_cost_usd`: LLM API 비용 (USD)

**사용 예시:**
```bash
# Health check
curl https://your-backend.railway.app/health

# Metrics (Prometheus 형식)
curl https://your-backend.railway.app/metrics
```

---

## 📊 Sentry 에러 추적

**자동으로 수집되는 정보:**
- ✅ 에러 발생 위치
- ✅ 스택 트레이스
- ✅ 사용자 컨텍스트
- ✅ 성능 데이터
- ✅ 릴리스 정보

**접근 방법:**
1. Sentry 대시보드 접속: https://sentry.io
2. 프로젝트 선택
3. **Issues** 탭에서 에러 확인
4. **Performance** 탭에서 성능 확인

**알림 설정:**
- 이메일 알림
- Slack 통합
- Discord 통합
- PagerDuty 통합

---

## 🎯 모니터링 대시보드 요약

### 일일 체크리스트

**아침 (9시):**
- [ ] Vercel Analytics에서 전날 트래픽 확인
- [ ] Railway Metrics에서 리소스 사용량 확인
- [ ] Sentry에서 새로운 에러 확인

**점심 (12시):**
- [ ] Vercel Analytics에서 실시간 트래픽 확인
- [ ] Railway Metrics에서 CPU/메모리 확인

**저녁 (6시):**
- [ ] Sentry에서 오늘 발생한 에러 확인
- [ ] Vercel Analytics에서 오늘의 성능 확인

---

## 🚨 알림 설정

### Vercel 알림
1. Vercel 대시보드 → 프로젝트 → Settings
2. **Notifications** 섹션
3. 알림 방법 선택:
   - 이메일
   - Slack
   - Discord

**알림 유형:**
- 배포 성공/실패
- 도메인 인증 만료
- 사용량 한도 도달

### Railway 알림
1. Railway 대시보드 → 프로젝트 → Settings
2. **Notifications** 섹션
3. 알림 방법 선택:
   - 이메일
   - Slack
   - Discord

**알림 유형:**
- 배포 성공/실패
- 리소스 사용량 경고
- 서비스 다운타임

### Sentry 알림
1. Sentry 대시보드 → 프로젝트 → Settings
2. **Alerts** 섹션
3. 알림 규칙 설정:
   - 새로운 에러 발생 시
   - 에러 빈도 증가 시
   - 성능 저하 시

---

## 📈 성능 모니터링

### Core Web Vitals (Vercel)

**자동으로 측정되는 지표:**
- **LCP (Largest Contentful Paint)**: 페이지 로드 성능
- **FID (First Input Delay)**: 상호작용 반응성
- **CLS (Cumulative Layout Shift)**: 시각적 안정성

**목표 값:**
- LCP: < 2.5초
- FID: < 100ms
- CLS: < 0.1

**확인 방법:**
1. Vercel 대시보드 → 프로젝트 → Analytics
2. **Performance** 탭
3. Core Web Vitals 확인

---

### 백엔드 성능 (Railway)

**모니터링 지표:**
- **응답 시간**: 평균, P50, P95, P99
- **처리량**: 초당 요청 수
- **에러율**: 에러 발생 비율

**확인 방법:**
1. Railway 대시보드 → 프로젝트 → 서비스
2. **Metrics** 탭
3. CPU/메모리 그래프 확인
4. **Logs** 탭에서 응답 시간 확인

---

## 🔧 고급 모니터링 (선택사항)

더 상세한 모니터링이 필요한 경우:

### Prometheus + Grafana
- 로컬에서 실행하는 고급 모니터링 스택
- 자세한 내용: [모니터링 가이드](./MONITORING_GUIDE.md)

### 상용 서비스
- **DataDog**: 통합 모니터링 플랫폼
- **New Relic**: APM 및 인프라 모니터링
- **Datadog**: 로그, 메트릭, 트레이스 통합

---

## 💡 모니터링 팁

1. **정기적으로 확인**: 매일 아침/저녁 체크
2. **알림 설정**: 중요한 이벤트에 대한 알림 설정
3. **트렌드 분석**: 주간/월간 트렌드 확인
4. **성능 최적화**: Core Web Vitals 개선에 집중

---

## 📚 관련 문서

- [프로덕션 우선 개발 가이드](./PRODUCTION_FIRST_GUIDE.md)
- [빠른 시작 가이드](./QUICK_START.md)
- [모니터링 가이드](./MONITORING_GUIDE.md) - 로컬 Prometheus + Grafana
