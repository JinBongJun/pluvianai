# AgentGuard 실행 가이드

## 방법 1: Docker 사용 (권장)

### 사전 요구사항
- Docker Desktop 설치 필요
- Windows: https://www.docker.com/products/docker-desktop/

### 실행 방법
```bash
# 1. Docker Desktop 실행

# 2. 프로젝트 디렉토리로 이동
cd C:\Users\user\Desktop\AgentGuard

# 3. 서비스 시작
docker compose up -d

# 4. 로그 확인
docker compose logs -f

# 5. 서비스 중지
docker compose down
```

---

## 방법 2: 로컬 실행 (Docker 없이)

### 사전 요구사항
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ (로컬 설치 또는 Docker로만 실행)
- Redis (선택사항)

### 1단계: PostgreSQL 설정

#### 옵션 A: Docker로 PostgreSQL만 실행
```bash
docker run -d \
  --name agentguard-postgres \
  -e POSTGRES_USER=agentguard \
  -e POSTGRES_PASSWORD=agentguard \
  -e POSTGRES_DB=agentguard \
  -p 5432:5432 \
  postgres:15-alpine
```

#### 옵션 B: 로컬 PostgreSQL 사용
- PostgreSQL 설치 후 데이터베이스 생성:
```sql
CREATE DATABASE agentguard;
CREATE USER agentguard WITH PASSWORD 'agentguard';
GRANT ALL PRIVILEGES ON DATABASE agentguard TO agentguard;
```

### 2단계: Redis 설정 (선택사항)

```bash
docker run -d \
  --name agentguard-redis \
  -p 6379:6379 \
  redis:7-alpine
```

### 3단계: 백엔드 실행

```bash
# 1. 가상환경 생성 (선택사항)
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# 2. 패키지 설치
pip install -r requirements.txt

# 3. 환경 변수 설정
# .env 파일이 프로젝트 루트에 있는지 확인

# 4. 백엔드 실행
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 4단계: 프론트엔드 실행

```bash
# 새 터미널에서
cd frontend

# 1. 패키지 설치
npm install

# 2. 프론트엔드 실행
npm run dev
```

### 접속
- 백엔드: http://localhost:8000
- 프론트엔드: http://localhost:3000
- API 문서: http://localhost:8000/docs

---

## 빠른 테스트

### 1. 헬스 체크
```bash
curl http://localhost:8000/health
```

### 2. 회원가입
```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234","full_name":"Test User"}'
```

### 3. 로그인
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=test@example.com&password=test1234"
```

---

## 문제 해결

### 데이터베이스 연결 오류
- PostgreSQL이 실행 중인지 확인
- .env 파일의 DATABASE_URL 확인
- 포트 5432가 사용 가능한지 확인

### 포트 충돌
- 8000번 포트: 백엔드
- 3000번 포트: 프론트엔드
- 5432번 포트: PostgreSQL
- 6379번 포트: Redis

다른 서비스가 사용 중이면 docker-compose.yml에서 포트 변경

### 프론트엔드 빌드 오류
```bash
cd frontend
rm -rf node_modules .next
npm install
npm run dev
```

---

## 다음 단계

1. ✅ 데이터베이스 테이블 생성 (자동)
2. ✅ 환경 변수 설정
3. ⏳ 서비스 실행
4. ⏳ 테스트
5. ⏳ SDK 구현 (선택)




