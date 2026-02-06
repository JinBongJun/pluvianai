# Railway DB 로컬 연결 가이드

## 1. Railway에서 DATABASE_URL 가져오기

### 방법 A: Railway 대시보드에서
1. Railway 프로젝트 페이지 접속: https://railway.com/project/7b200a75-0c0b-44bc-ac94-da14171db012
2. PostgreSQL 서비스 클릭
3. **Variables** 탭 클릭
4. `DATABASE_URL` 또는 `POSTGRES_URL` 찾기
5. 값 복사 (예: `postgresql://postgres:password@host:port/railway`)

### 방법 B: Railway CLI 사용
```bash
# Railway CLI 설치 (한 번만)
npm install -g @railway/cli

# 로그인
railway login

# 프로젝트 연결
railway link

# DATABASE_URL 출력
railway variables
```

## 2. 로컬 .env 파일 생성

프로젝트 루트에 `.env` 파일 생성:

```env
# Railway PostgreSQL 연결
DATABASE_URL=postgresql://postgres:비밀번호@호스트:포트/railway

# Redis (로컬 또는 Railway)
REDIS_URL=redis://localhost:6379/0

# 보안 키 (Railway와 동일하게)
SECRET_KEY=your-secret-key-from-railway

# 기타 환경 변수들...
```

## 3. 백엔드 재시작

```powershell
# 기존 백엔드 중지 (Ctrl+C)
# 새로 시작
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 4. DB 마이그레이션 (필수)

코드에 `organizations.description` 컬럼이 추가된 경우, **반드시** 마이그레이션을 적용해야 합니다.  
적용하지 않으면 조직/프로젝트 API가 500을 반환하고, Projects 페이지가 계속 로딩되거나 "Organization data is missing" 에러가 납니다.

```powershell
cd backend
.\.venv\Scripts\Activate.ps1   # 가상환경 활성화
python -m alembic upgrade head
```

- `column organizations.description does not exist` 에러가 나면 → 위 명령으로 마이그레이션 적용 후 백엔드 재시작.

---

## ⚠️ 주의사항

- **실제 프로덕션 DB**이므로 실수로 데이터를 삭제하지 않도록 주의하세요
- 로컬에서 테스트할 때는 가능하면 읽기 전용 작업만 수행하세요
- 필요시 Railway에서 백업을 먼저 생성하세요
