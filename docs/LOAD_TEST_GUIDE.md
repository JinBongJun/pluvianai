# 부하 테스트 가이드

AgentGuard는 Locust를 사용하여 API 부하 테스트를 수행합니다.

## 🚀 빠른 시작

### 로컬에서 실행

```bash
# 백엔드 서버 시작
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 다른 터미널에서 Locust 실행
locust -f locustfile.py --host=http://localhost:8000

# 웹 UI 접속
# http://localhost:8089
```

### 헤드리스 모드 (CI/CD)

```bash
locust -f locustfile.py \
  --headless \
  --users 50 \
  --spawn-rate 10 \
  --run-time 2m \
  --host http://localhost:8000 \
  --html report.html
```

## 📊 테스트 시나리오

현재 구현된 시나리오:

1. **로그인** (시작 시 1회)
2. **프로젝트 목록 조회** (가중치: 5)
3. **API 호출 목록 조회** (가중치: 4)
4. **품질 점수 조회** (가중치: 3)
5. **드리프트 감지 조회** (가중치: 2)
6. **비용 분석 조회** (가중치: 2)
7. **알림 조회** (가중치: 1)
8. **헬스 체크** (가중치: 1)

## 🔧 커스터마이징

### 사용자 수 조정

```bash
# 100명의 동시 사용자
locust -f locustfile.py --users 100 --spawn-rate 20
```

### 테스트 시간 조정

```bash
# 5분간 실행
locust -f locustfile.py --run-time 5m
```

### 커스텀 시나리오 추가

`backend/locustfile.py`를 수정하여 새로운 테스트 시나리오를 추가할 수 있습니다:

```python
@task(3)
def custom_endpoint(self):
    """Custom endpoint test"""
    self.client.get("/api/v1/custom-endpoint")
```

## 📈 성능 기준

### 목표 성능 지표

- **응답 시간 (p95)**: < 500ms
- **응답 시간 (p99)**: < 1s
- **에러율**: < 1%
- **처리량**: > 100 req/s

### 성능 회귀 감지

CI/CD에서 자동으로 부하 테스트를 실행하고, 성능 기준을 초과하면 경고합니다.

## 🚨 문제 해결

### 메모리 부족

```bash
# 사용자 수 줄이기
locust -f locustfile.py --users 20
```

### 연결 오류

```bash
# 타임아웃 증가
locust -f locustfile.py --timeout 30
```

## 📚 추가 리소스

- [Locust 공식 문서](https://docs.locust.io/)
- [부하 테스트 모범 사례](https://docs.locust.io/en/stable/writing-a-locustfile.html)

---

**정기적인 부하 테스트로 성능 회귀를 조기 발견하세요!** 🚀
