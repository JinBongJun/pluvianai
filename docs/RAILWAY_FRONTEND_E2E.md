# 로컬 프론트 → Railway 백엔드 연결 및 한데까지(E2E) 테스트

로컬에서 프론트만 띄우고 Railway에 배포된 백엔드를 붙여서 **한데까지** 테스트하는 방법입니다.

## 포트·URL 정리

| 구분 | 포트 | URL 예시 |
|------|------|----------|
| **Railway 백엔드** | Railway가 `$PORT` 지정 (보통 내부용) | `https://agentguard-production.up.railway.app` 등 **Public Domain** |
| **로컬 프론트** | 3000 | `http://localhost:3000` |
| **로컬 백엔드** (선택) | 8000 또는 8888 | `http://localhost:8000` |

- 프론트는 **항상** `NEXT_PUBLIC_API_URL`로 백엔드 주소를 참조합니다.
- Railway 백엔드는 **Public Domain** URL을 사용해야 합니다 (내부 포트 아님).

---

## 1. Railway 백엔드 URL 확인

1. https://railway.app 대시보드 접속
2. 프로젝트 선택 → **Backend 서비스** 클릭
3. **Settings** 탭 → **Networking** / **Public Networking**
4. **Generate Domain** 또는 이미 있는 **Public Domain** 복사  
   - 예: `https://agentguard-production.up.railway.app`  
   - 예: `https://agentguard-backend-production-xxxx.up.railway.app`

백엔드 동작 확인:

```bash
curl https://<여기에_복사한_도메인>/health
# 예: curl https://agentguard-production.up.railway.app/health
```

---

## 2. 로컬 프론트에서 Railway 백엔드 연결

### 2-1. `frontend/.env.local` 설정

`frontend` 폴더에 `.env.local`이 없다면 복사해서 만듭니다.

```bash
cd frontend
# .env.example이 있으면: copy .env.example .env.local
# 없으면 아래 내용으로 .env.local 생성
```

**`.env.local` 내용 (Railway 백엔드 사용 시):**

```env
# Railway 배포 백엔드 URL (1단계에서 복사한 Public Domain)
NEXT_PUBLIC_API_URL=https://agentguard-production.up.railway.app

# 선택 (이미 있으면 유지)
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=
```

- `https://agentguard-production.up.railway.app` 부분을 **본인 Railway Public Domain**으로 바꿉니다.
- 로컬 백엔드만 쓸 때는 `NEXT_PUBLIC_API_URL=http://localhost:8000` (또는 `http://localhost:8888`) 로 두면 됩니다.

### 2-2. 프론트 실행

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 **http://localhost:3000** 접속.

---

## 3. 한데까지(E2E) 확인 순서

1. **로그인**  
   - Railway DB에 있는 계정으로 로그인 가능해야 합니다.
2. **조직/프로젝트**  
   - 조직 목록, 프로젝트 생성/선택이 Railway 백엔드와 연동되는지 확인.
3. **Live View**  
   - 프로젝트 → Live View 진입 시 에이전트 박스/빈 상태가 Railway 데이터 기준으로 나오는지 확인.
4. **API Calls / Settings**  
   - API Calls 목록, 설정(API Keys 등)이 저장/조회되는지 확인.

문제가 있으면 브라우저 **개발자 도구 → Network** 탭에서 `NEXT_PUBLIC_API_URL`로 요청이 나가는지, 상태 코드가 200/401 등 어떤지 확인합니다.

---

## 4. CORS

Railway 백엔드는 기본적으로 `allow_origins = ["*"]` 로 설정되어 있어,  
`http://localhost:3000` 에서의 요청도 허용됩니다. 별도 CORS 설정 없이 로컬 프론트 → Railway 백엔드 조합으로 테스트 가능합니다.

---

## 5. 요약

| 단계 | 작업 |
|------|------|
| 1 | Railway 대시보드에서 Backend **Public Domain** 복사 |
| 2 | `frontend/.env.local`에 `NEXT_PUBLIC_API_URL=https://<복사한_도메인>` 설정 |
| 3 | `cd frontend && npm run dev` 후 `http://localhost:3000` 접속 |
| 4 | 로그인 → 조직/프로젝트 → Live View 등 한데까지 동작 확인 |

이렇게 하면 **로컬 프론트**만 쓰고 **Railway 백엔드**에 연결해서 한데까지 테스트할 수 있습니다.
