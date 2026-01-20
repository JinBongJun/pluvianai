# 일일 운영 가이드 (Daily Operations Guide)

## 일일 체크리스트 (5분)

### 모니터링 대시보드
1. **Vercel 대시보드** 확인
   - URL: https://vercel.com/dashboard
   - 프론트엔드 배포 상태 확인
   - 최근 에러 확인

2. **Railway 대시보드** 확인
   - URL: https://railway.app/dashboard
   - 백엔드 서비스 상태 확인
   - 데이터베이스 상태 확인

3. **Sentry** 확인
   - URL: https://sentry.io/
   - 새로운 에러 확인
   - Critical 에러 우선 검토

4. **Health Check 대시보드** 확인
   - URL: `/admin/health`
   - 시스템 전체 상태 확인
   - 데이터베이스, Redis 상태 확인

### 알림 확인
- 이메일: Critical 알림 확인
- Slack/Discord: 중요한 알림 확인

### 빠른 기능 확인
- 메인 대시보드 접속 테스트
- 주요 API 엔드포인트 응답 시간 확인

## 자동화된 작업

다음 작업들은 자동으로 실행됩니다:
- **매시간**: Health Check
- **매일 2 AM UTC**: Drift Detection
- **매일 3 AM UTC**: Cost Anomaly Detection
- **매일 9 AM UTC**: Infrastructure Cost Check

## 빠른 참조

### 주요 URL
- 프론트엔드: https://agentguard.vercel.app
- API: https://agentguard-production.up.railway.app
- Health Check: `/admin/health`

### 문제 발생 시
1. Health Check 대시보드 확인
2. Sentry에서 에러 로그 확인
3. Railway/Vercel 로그 확인
4. OPERATIONS_GUIDE.md의 문제 해결 섹션 참조
