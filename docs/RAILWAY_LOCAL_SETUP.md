# Railway DB 로컬 연결 가이드

## 방법 1: 로컬 프론트엔드 → Railway 백엔드 (추천 ⭐)

가장 간단한 방법입니다. 로컬 프론트엔드만 실행하고 Railway에 배포된 백엔드를 사용합니다.

### 설정 방법

1. Railway 백엔드 URL 확인:
   - Railway 프로젝트 → Backend 서비스
   - Settings 탭에서 Public Domain 확인
   - 예: `https://agentguard-production.up.railway.app`

2. 프론트엔드 `.env.local` 파일 생성:
   ```bash
   cd frontend
   ```
   
   `.env.local` 파일 생성:
   ```env
   NEXT_PUBLIC_API_URL=https://your-backend.railway.app
   ```

3. 프론트엔드 실행:
   ```bash
   npm run dev
   ```

4. 브라우저에서 `http://localhost:3000` 접속
   - Railway에 있는 계정으로 로그인 가능!

---

## 방법 2: Railway CLI 터널링 (로컬 백엔드 사용 시)

로컬 백엔드를 사용하고 싶다면 Railway CLI로 DB 터널링을 사용합니다.

### 설정 방법

1. Railway CLI 설치:
   ```bash
   npm install -g @railway/cli
   ```

2. Railway 로그인:
   ```bash
   railway login
   ```

3. 프로젝트 연결:
   ```bash
   railway link
   ```

4. 터널 시작 (새 터미널):
   ```bash
   railway connect postgres
   ```
   
   이 명령어가 로컬 포트(예: `localhost:5432`)를 Railway DB에 연결합니다.

5. `.env` 파일에서 DATABASE_URL 업데이트:
   ```env
   DATABASE_URL=postgresql://postgres:비밀번호@localhost:5432/railway
   ```
   
   (터널이 로컬 포트를 사용하므로 `localhost` 사용)

6. 백엔드 실행:
   ```bash
   cd backend
   .\.venv\Scripts\Activate.ps1
   python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

---

## 비교

| 방법 | 장점 | 단점 |
|------|------|------|
| 방법 1 | 간단, 빠름, 추가 설정 없음 | Railway 백엔드 사용 |
| 방법 2 | 로컬 백엔드 디버깅 가능 | Railway CLI 필요, 터널 유지 필요 |

**추천: 방법 1** (로컬 프론트엔드 → Railway 백엔드)
