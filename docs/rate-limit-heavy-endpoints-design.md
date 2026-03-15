# 엔드포인트별 Rate Limit 설계 (바로 구현용)

## 1. 왜 필요한가 (쉬운 설명)

- **현재:** 모든 API에 "IP당 분당 60번"만 적용됨.
- **문제:** 품질 평가·동작 검증·ingest 같은 **비용/부하 큰 API**도 60번까지 호출 가능 → 비용 폭탄·서버 과부하 가능.
- **목표:** 가벼운 API는 기존대로, **무거운 API만 더 낮은 한도**로 제한.

---

## 2. 적용 대상 경로와 한도

아래는 **request.url.path** 기준으로 middleware에서 매칭한다. (prefix는 `/api/v1`)

| 구분 | path에 포함할 문자열 | HTTP 메서드 | 한도 (기본값) | 비고 |
|------|----------------------|-------------|----------------|------|
| quality evaluate | `quality/evaluate` | POST | 20/min per IP | 품질 평가 |
| behavior validate | `behavior/validate` | POST | 20/min per IP | 동작 검증 |
| behavior compare | `behavior/compare` | POST | 20/min per IP | 동작 비교 |
| api-calls ingest | `api-calls` | POST | 100/min per IP | ingest |
| snapshots create | `snapshots` | POST | 10/min per IP | path 끝이 /snapshots 일 때만 |
| release-gate validate | `release-gate/validate` | POST | 20/min per IP | 동기 검증 |
| release-gate validate-async | `release-gate/validate-async` | POST | 20/min per IP | 비동기 검증 |

- **전역 한도:** 기존 60 req/min per IP 유지.
- **무거운 경로:** 위 경로에 해당하면 전역 체크 후 **엔드포인트별 키**로 한 번 더 체크.

---

## 3. 구현 위치와 방식

### 3.1 수정할 파일

- `backend/app/middleware/rate_limit.py` — 전역 한도 + 엔드포인트별 한도 모두 여기서 처리.

### 3.2 경로 매칭 규칙 (코드용)

- `HEAVY_ENDPOINTS`: 긴 path 먼저 매칭 (release-gate/validate-async → release-gate/validate).
- 특수: `path.endswith("/snapshots")` 및 POST → 10/min. `"api-calls" in path` 및 POST → 100/min.

---

## 4. 키 및 저장 형식

- **전역 (기존):** `rate_limit:{client_ip}` — 60/min.
- **엔드포인트별:** `rate_limit:heavy:{path_key}:{client_ip}`
  - path_key: `quality_evaluate`, `behavior_validate`, `behavior_compare`, `api_calls`, `snapshots`, `release_gate_validate`
- **TTL / 윈도우:** 60초.
- **저장소:** Redis 있으면 Redis(cache_service), 없으면 in-memory `_memory_heavy`.

---

## 5. dispatch 순서

1. health, OPTIONS → 스킵.
2. 전역 60/min 체크 (기존). 실패 시 429.
3. 무거운 경로면 (path_key, limit) 조회 후 엔드포인트별 체크. 실패 시 429.
4. `call_next(request)`.

---

## 6. 공통 함수 시그니처

```python
def check_endpoint_rate_limit(
    client_ip: str,
    path_key: str,
    limit_per_minute: int,
    window_sec: int = 60,
) -> bool:
    """Returns True if under limit (and increments), False if over limit."""
```

---

## 7. 429 메시지

- 엔드포인트별: `"Rate limit exceeded for this endpoint. Maximum {limit} requests per minute. Try again later."`

---

## 8. 설정값 (상수)

- `RATE_LIMIT_GLOBAL_PER_MINUTE` = 60 (middleware 생성자)
- `RATE_LIMIT_HEAVY_PER_MINUTE` = 20 (quality, behavior, release-gate validate)
- `RATE_LIMIT_INGEST_PER_MINUTE` = 100 (api-calls POST)
- `RATE_LIMIT_SNAPSHOTS_CREATE_PER_MINUTE` = 10

---

## 9. 구현 체크리스트

- [x] HEAVY_ENDPOINTS 상수 및 _get_heavy_limit(path, method) 추가
- [x] _memory_heavy + Redis 경로 check_endpoint_rate_limit 구현
- [x] dispatch에서 전역 체크 후 무거운 경로면 엔드포인트별 체크
- [x] 429 시 엔드포인트별 메시지
- [ ] 통합 테스트: limit+1 회 요청 시 429 확인 (선택)

---

## 10. 참고: 실제 API 경로 (매칭 확인용)

| 경로 (request.url.path) | 적용 한도 |
|--------------------------|-----------|
| `/api/v1/projects/1/quality/evaluate` (POST) | 20/min |
| `/api/v1/projects/1/behavior/validate` (POST) | 20/min |
| `/api/v1/projects/1/behavior/compare` (POST) | 20/min |
| `/api/v1/projects/1/api-calls` (POST) | 100/min |
| `/api/v1/projects/1/snapshots` (POST) | 10/min |
| `/api/v1/projects/1/release-gate/validate` (POST) | 20/min |
| `/api/v1/projects/1/release-gate/validate-async` (POST) | 20/min |
