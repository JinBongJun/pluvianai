# 로그인 문제 해결 가이드

## 현재 상황

로그인 시 "An error occurred" 오류 발생

## 가능한 원인

### 1. 백엔드 서버 연결 문제

**확인 방법:**
- 브라우저 개발자 도구 (F12) → Console 탭
- Network 탭에서 `/api/v1/auth/login` 요청 확인
- 에러 메시지 확인

**해결 방법:**
- Railway 백엔드가 실행 중인지 확인
- `NEXT_PUBLIC_API_URL` 환경 변수가 올바른지 확인

### 2. 환경 변수 설정 문제

**Vercel에서 확인:**
1. Vercel 프로젝트 → Settings → Environment Variables
2. `NEXT_PUBLIC_API_URL` 확인
3. Railway 백엔드 URL과 일치하는지 확인
   - 예: `https://agentguard-backend.up.railway.app`

### 3. CORS 문제

**확인 방법:**
- 브라우저 Console에서 CORS 에러 확인
- "Access-Control-Allow-Origin" 에러

**해결 방법:**
- Railway 백엔드 환경 변수에서 `CORS_ORIGINS` 확인
- Vercel 프론트엔드 URL이 포함되어 있는지 확인

### 4. 사용자 계정 문제

**확인 방법:**
- 회원가입을 먼저 시도
- 또는 백엔드 Swagger UI에서 직접 테스트

**해결 방법:**
1. "Sign up" 클릭하여 새 계정 생성
2. 또는 Railway 백엔드 Swagger UI에서 사용자 생성

### 5. 백엔드 서버가 실행되지 않음

**확인 방법:**
- Railway 대시보드에서 서비스 상태 확인
- Railway 로그 확인

**해결 방법:**
- Railway 서비스 재시작
- 환경 변수 확인

## 디버깅 단계

### 1. 브라우저 개발자 도구 확인

1. F12 키 누르기
2. Console 탭에서 에러 확인
3. Network 탭에서 `/api/v1/auth/login` 요청 확인:
   - Status Code 확인
   - Response 확인
   - Request URL 확인

### 2. Vercel 환경 변수 확인

1. Vercel → Settings → Environment Variables
2. `NEXT_PUBLIC_API_URL` 값 확인
3. Railway 백엔드 URL과 일치하는지 확인

### 3. Railway 백엔드 확인

1. Railway 대시보드 → 서비스 로그 확인
2. `/api/v1/auth/login` 엔드포인트가 작동하는지 확인
3. Swagger UI에서 직접 테스트:
   - `https://your-backend-url.up.railway.app/docs`

### 4. 직접 API 테스트

터미널에서:
```bash
curl -X POST "https://your-backend-url.up.railway.app/api/v1/auth/login" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=bongjun0289@daum.net&password=@manwang01"
```

## 개선된 에러 메시지

이제 더 자세한 에러 메시지가 표시됩니다:
- 서버 연결 실패: "Cannot connect to server..."
- 서버 에러: "Server error: 401" 등
- 상세 에러: 백엔드에서 반환한 상세 메시지

## 다음 단계

1. 브라우저 Console에서 실제 에러 확인
2. Network 탭에서 요청 상태 확인
3. Vercel 환경 변수 확인
4. Railway 백엔드 상태 확인


