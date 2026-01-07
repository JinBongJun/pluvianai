# 백엔드 연결 문제 해결

## 현재 문제

에러 메시지: "Cannot connect to server. Please check if the backend is running."

## 원인

프론트엔드(Vercel)가 백엔드(Railway)에 연결할 수 없음

## 해결 방법

### 1. Vercel 환경 변수 확인 및 설정

1. **Vercel 프로젝트 → Settings → Environment Variables**
2. 다음 변수 확인/추가:
   ```
   NEXT_PUBLIC_API_URL = https://your-railway-backend-url.up.railway.app
   ```
3. Railway 백엔드 URL 확인:
   - Railway 대시보드 → 백엔드 서비스
   - Settings → Networking
   - 생성된 도메인 확인 (예: `agentguard-production-xxx.up.railway.app`)

### 2. Railway 백엔드 확인

1. **Railway 대시보드에서:**
   - 백엔드 서비스가 "Running" 상태인지 확인
   - 로그에서 에러가 없는지 확인

2. **백엔드 URL 테스트:**
   ```bash
   curl https://your-railway-backend-url.up.railway.app/health
   ```
   또는 브라우저에서:
   ```
   https://your-railway-backend-url.up.railway.app/docs
   ```

### 3. CORS 설정 확인

**Railway 백엔드 환경 변수:**
```
CORS_ORIGINS = https://agent-guard-feilynmhv-bongjun0289-9527s-projects.vercel.app
```

또는 여러 URL:
```
CORS_ORIGINS = https://agent-guard-feilynmhv-bongjun0289-9527s-projects.vercel.app,https://agent-guard.vercel.app
```

### 4. 환경 변수 업데이트 후 재배포

1. **Vercel:**
   - 환경 변수 추가/수정 후
   - 자동으로 재배포되거나
   - 수동으로 "Redeploy" 클릭

2. **Railway:**
   - 환경 변수 추가/수정 후
   - 자동으로 재시작되거나
   - 수동으로 "Restart" 클릭

## 확인 체크리스트

- [ ] Vercel에 `NEXT_PUBLIC_API_URL` 환경 변수 설정됨
- [ ] Railway 백엔드 URL이 올바름
- [ ] Railway 백엔드가 실행 중
- [ ] Railway에 `CORS_ORIGINS` 환경 변수 설정됨
- [ ] Vercel URL이 CORS_ORIGINS에 포함됨
- [ ] 환경 변수 업데이트 후 재배포 완료

## 빠른 테스트

브라우저에서 직접 테스트:
```
https://your-railway-backend-url.up.railway.app/docs
```

Swagger UI가 열리면 백엔드는 정상 작동 중입니다.


