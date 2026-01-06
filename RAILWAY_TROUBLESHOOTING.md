# Railway 빌드 실패 해결 가이드

## 현재 상황
- AgentGuard 서비스가 추가되었지만 "Build failed" 상태

## 해결 방법

### 1단계: 로그 확인
1. 왼쪽 사이드바에서 "AgentGuard" 서비스 클릭
2. "Deployments" 탭 클릭
3. 최근 배포의 "Logs" 클릭
4. 에러 메시지 확인

### 2단계: 설정 확인
AgentGuard 서비스를 클릭한 후:

1. **Settings → Source** 확인:
   - Root Directory: `backend` (확인!)
   - Build Command: (비워두거나 `pip install -r requirements.txt`)
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

2. **Variables** 확인:
   - `DATABASE_URL` 자동 생성 확인
   - `REDIS_URL` (Redis 추가했다면) 자동 생성 확인
   - `SECRET_KEY` 추가 필요
   - `DEBUG=false` 추가

### 3단계: 일반적인 문제 해결

#### 문제 1: Root Directory 설정
- Settings → Source → Root Directory: `backend` 확인

#### 문제 2: Start Command 오류
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- 또는: `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`

#### 문제 3: 의존성 설치 실패
- Build Command에 `pip install -r requirements.txt` 명시

#### 문제 4: 포트 설정
- Railway는 자동으로 `$PORT` 환경 변수를 제공
- 코드에서 `$PORT` 사용 확인

---

## 빠른 수정 방법

1. AgentGuard 서비스 클릭
2. Settings → Source:
   - Root Directory: `backend` 확인
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT` 확인
3. Settings → Variables:
   - `SECRET_KEY` 추가 (랜덤 문자열)
   - `DEBUG=false` 추가
4. "Redeploy" 클릭

