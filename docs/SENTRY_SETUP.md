# Sentry 설정 가이드

AgentGuard에 Sentry 에러 트래킹을 설정하는 방법입니다.

## 1. Sentry 계정 생성 및 프로젝트 설정

1. [Sentry.io](https://sentry.io)에 가입
2. 새 프로젝트 생성:
   - **Backend**: Python (FastAPI) 프로젝트 생성
   - **Frontend**: Next.js 프로젝트 생성
3. 각 프로젝트의 DSN (Data Source Name) 복사

## 2. 백엔드 환경 변수 설정 (Railway)

Railway 프로젝트의 Variables 탭에서 다음 환경 변수를 추가:

```bash
SENTRY_DSN=https://your-backend-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=production  # 또는 staging, development
SENTRY_TRACES_SAMPLE_RATE=0.1  # 10% of transactions (선택사항)
```

## 3. 프론트엔드 환경 변수 설정 (Vercel)

Vercel 프로젝트의 Settings > Environment Variables에서 다음을 추가:

```bash
NEXT_PUBLIC_SENTRY_DSN=https://your-frontend-dsn@sentry.io/project-id
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_RELEASE=agentguard@0.1.0

# Source maps 업로드를 위한 설정 (선택사항)
SENTRY_ORG=your-org-slug
SENTRY_PROJECT=your-project-slug
SENTRY_AUTH_TOKEN=your-auth-token
```

### Source Maps 업로드 설정 (선택사항)

Source maps를 업로드하면 Sentry에서 원본 코드를 볼 수 있습니다:

1. Sentry > Settings > Account > Auth Tokens에서 새 토큰 생성
   - Scopes: `project:releases`, `org:read`
2. Vercel 환경 변수에 추가:
   - `SENTRY_ORG`: 조직 슬러그
   - `SENTRY_PROJECT`: 프로젝트 슬러그
   - `SENTRY_AUTH_TOKEN`: 생성한 토큰

## 4. 로컬 개발 환경 설정

`.env` 파일에 추가 (프론트엔드):

```bash
NEXT_PUBLIC_SENTRY_DSN=https://your-frontend-dsn@sentry.io/project-id
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development
```

백엔드 `.env` 파일:

```bash
SENTRY_DSN=https://your-backend-dsn@sentry.io/project-id
SENTRY_ENVIRONMENT=development
```

## 5. 테스트

### 백엔드 테스트

에러를 발생시키는 테스트 엔드포인트를 호출하거나, 실제 에러가 발생하면 Sentry 대시보드에서 확인할 수 있습니다.

### 프론트엔드 테스트

브라우저 콘솔에서:

```javascript
// Sentry 테스트 에러 발생
throw new Error("Sentry test error");
```

또는 개발자 도구에서 에러를 발생시키면 자동으로 Sentry에 보고됩니다.

## 6. Sentry 대시보드 확인

1. [Sentry Dashboard](https://sentry.io) 접속
2. 프로젝트 선택
3. Issues 탭에서 에러 확인
4. Performance 탭에서 성능 메트릭 확인

## 7. 알림 설정

Sentry에서 알림을 설정하여 에러 발생 시 이메일/Slack으로 알림을 받을 수 있습니다:

1. Settings > Alerts
2. Alert Rules 생성
3. 조건 설정 (예: 에러 발생 시, 특정 레벨 이상의 에러 등)

## 참고사항

- **무료 플랜**: 월 5,000 이벤트까지 무료
- **성능 모니터링**: `tracesSampleRate`로 샘플링 비율 조정 가능
- **개인정보 보호**: `send_default_pii=False`로 설정하여 PII 전송 방지
- **Release 버전**: 배포 시마다 release 버전을 업데이트하면 에러 추적이 더 쉬워집니다

## 문제 해결

### Sentry가 작동하지 않는 경우

1. DSN이 올바르게 설정되었는지 확인
2. 환경 변수가 올바르게 로드되었는지 확인
3. Sentry 대시보드에서 프로젝트 상태 확인
4. 브라우저 콘솔/서버 로그에서 Sentry 초기화 메시지 확인

### Source Maps가 업로드되지 않는 경우

1. `SENTRY_AUTH_TOKEN`이 올바른지 확인
2. `SENTRY_ORG`와 `SENTRY_PROJECT`가 올바른지 확인
3. 토큰에 필요한 권한이 있는지 확인
