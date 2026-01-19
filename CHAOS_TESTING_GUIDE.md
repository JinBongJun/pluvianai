# Chaos Testing 가이드

AgentGuard는 Chaos Engineering을 통해 시스템의 복원력을 검증합니다.

## 🚀 빠른 시작

### 로컬에서 실행

```bash
# 백엔드 서버 시작
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000

# 다른 터미널에서 Chaos 테스트 실행
pytest tests/chaos/ -v
```

### CI/CD에서 자동 실행

매주 토요일 자동으로 실행되며, 수동으로도 트리거할 수 있습니다.

## 🧪 테스트 시나리오

### 1. 데이터베이스 연결 손실

```python
test_database_connection_loss()
```

**목적**: 데이터베이스 연결이 끊어졌을 때 시스템이 정상적으로 동작하는지 확인

**검증 사항**:
- 에러가 graceful하게 처리됨
- 시스템이 크래시하지 않음
- 연결 복구 시 자동 재연결

### 2. Redis 연결 손실

```python
test_redis_connection_loss()
```

**목적**: Redis가 사용 불가능할 때 시스템이 계속 동작하는지 확인

**검증 사항**:
- 캐시 없이도 동작 (graceful degradation)
- Rate limiting이 비활성화됨
- 시스템이 크래시하지 않음

### 3. 고지연 환경

```python
test_high_latency()
```

**목적**: 높은 지연 시간 환경에서 시스템이 정상 동작하는지 확인

**검증 사항**:
- 타임아웃이 적절히 설정됨
- 요청이 완료됨 (느리더라도)
- 에러율이 허용 범위 내

### 4. 메모리 압박

```python
test_memory_pressure()
```

**목적**: 메모리 부족 상황에서 시스템이 정상 동작하는지 확인

**검증 사항**:
- 메모리 누수 없음
- 가비지 컬렉션이 정상 작동
- 시스템이 안정적으로 동작

### 5. 에러 복구

```python
test_error_recovery()
```

**목적**: 에러 발생 후 시스템이 복구되는지 확인

**검증 사항**:
- 에러가 graceful하게 처리됨
- 시스템이 계속 동작함
- 로깅이 정상 작동

## 🔧 커스텀 Chaos 테스트 추가

```python
@pytest.mark.asyncio
async def test_custom_scenario():
    """Custom chaos test"""
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        # Your test logic here
        response = await client.get("/health")
        assert response.status_code == 200
```

## 📊 성공 기준

### 필수 통과 조건

- ✅ 시스템이 크래시하지 않음
- ✅ 에러가 graceful하게 처리됨
- ✅ 로깅이 정상 작동
- ✅ 복구 메커니즘이 작동

### 선택적 조건

- ⚠️ 일부 요청 실패 허용 (극단적 상황)
- ⚠️ 성능 저하 허용 (복구 중)

## 🚨 주의사항

1. **프로덕션 환경에서 실행 금지**: Chaos 테스트는 개발/스테이징 환경에서만 실행
2. **데이터 백업**: 테스트 전 데이터 백업 권장
3. **모니터링**: 테스트 중 모니터링 대시보드 확인

## 📚 추가 리소스

- [Chaos Engineering 원칙](https://principlesofchaos.org/)
- [Netflix Chaos Monkey](https://github.com/Netflix/chaosmonkey)

---

**Chaos Testing으로 시스템의 복원력을 검증하세요!** 🧪
