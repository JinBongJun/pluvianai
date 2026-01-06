# 데이터베이스 마이그레이션 실행 가이드

## 방법 1: Python 스크립트 사용 (권장)

### 1단계: 데이터베이스가 실행 중인지 확인

```bash
# Docker Compose 사용하는 경우
docker compose ps

# PostgreSQL이 실행 중이어야 합니다
```

### 2단계: 마이그레이션 스크립트 실행

```bash
# 프로젝트 루트에서
cd backend
python scripts/init_db.py
```

성공하면:
```
✅ Database tables created successfully!
```

### 3단계: 기존 사용자에게 구독 생성 (선택사항)

기존 사용자가 있다면 free 플랜 구독을 생성합니다:

```bash
python scripts/migrate_existing_users.py
```

---

## 방법 2: Admin API 엔드포인트 사용

백엔드가 실행 중일 때:

```bash
# 로컬 환경
curl -X POST http://localhost:8000/api/v1/admin/init-db

# 프로덕션 (Railway)
curl -X POST https://your-backend-url.up.railway.app/api/v1/admin/init-db
```

---

## 방법 3: Docker Compose로 전체 실행

```bash
# 1. Docker Compose로 서비스 시작
docker compose up -d

# 2. 백엔드 컨테이너에서 마이그레이션 실행
docker compose exec backend python scripts/init_db.py

# 3. 기존 사용자 마이그레이션 (선택사항)
docker compose exec backend python scripts/migrate_existing_users.py
```

---

## 확인

마이그레이션이 성공했는지 확인:

### 방법 1: API로 확인
```bash
# 구독 플랜 목록 조회
curl http://localhost:8000/api/v1/subscription/plans
```

### 방법 2: PostgreSQL에 직접 연결
```bash
# Docker Compose 사용하는 경우
docker compose exec postgres psql -U agentguard -d agentguard

# 테이블 확인
\dt

# subscriptions 테이블 확인
SELECT * FROM subscriptions;
```

---

## 문제 해결

### 오류: "relation already exists"
- 정상입니다. 테이블이 이미 존재한다는 의미입니다.
- 새로 생성된 테이블만 추가됩니다.

### 오류: "connection refused"
- PostgreSQL이 실행 중인지 확인하세요.
- `docker compose ps`로 확인

### 오류: "authentication failed"
- DATABASE_URL 환경 변수를 확인하세요.
- `.env` 파일이 올바른지 확인하세요.

