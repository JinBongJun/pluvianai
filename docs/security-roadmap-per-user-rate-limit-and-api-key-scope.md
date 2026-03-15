# 단기·중기 보완 계획 (Per-user Rate Limit + API Key Scope)

## 현재 구조 요약

- **Rate limit:** 전역 60/min + 무거운 엔드포인트별 한도, 모두 **per IP**만 적용. `user_id` 미사용.
- **인증:**  
  - **JWT** (Bearer/cookie) → `get_current_user`  
  - **플랫폼 API 키** (`ag_live_` / `ag_test_`) → `get_user_from_api_key` → `APIKey` 테이블 (user_id, key_hash만 있음, **scope 없음**).
- **API 키 사용처:** ingest(`POST .../api-calls`)만 `get_current_user_or_api_key` 사용. 나머지 경로는 JWT 전제.
- **UserApiKey:** LLM 프로바이더 키 저장용(project/provider). 우리 API 인증용 아님.

---

## Phase 1 (단기): Per-user Rate Limit

**목표:** IP 한도에 더해 **user 단위 한도** 적용. (NAT/공유 IP 대비, OWASP 권장)

**방식**

1. **미들웨어에서 user_id 얻기**  
   - Rate limit 미들웨어에서 **JWT만 decode**해서 `sub`(user_id) 추출.  
   - DB/세션 조회 없이, 서명 검증 + 만료만 확인. 실패/없으면 user 한도는 스킵(기존처럼 IP만 적용).
2. **키 설계**  
   - 기존: `rate_limit:{client_ip}` (전역), `rate_limit:heavy:{path_key}:{client_ip}` (무거운 경로).  
   - 추가: `rate_limit:user:{user_id}` (예: 60/min). Redis/메모리 동일.
3. **적용 순서**  
   - 전역 IP 한도 → (있으면) 전역 user 한도 → (무거운 경로면) 엔드포인트별 IP 한도 → (있으면) 엔드포인트별 user 한도.  
   - 하나라도 초과면 429.
4. **설정**  
   - `RATE_LIMIT_USER_PER_MINUTE` = 60 (기본). IP와 동일하거나 더 넉넉하게 조정 가능.

**수정 파일**

- `backend/app/middleware/rate_limit.py`  
  - JWT decode 유틸(settings.SECRET_KEY, 알고리즘만) 추가.  
  - `dispatch`에서 Authorization Bearer 있으면 decode → `sub` → `rate_limit:user:{user_id}` 체크/증가.

**주의**

- API 키 인증 요청은 미들웨어에서 user를 알기 어려우면, 이 단계에서는 **JWT 요청에만 per-user 적용**하고, API 키는 Phase 2에서 scope와 함께 다룸.

---

## Phase 2 (중기): API Key Scope

**목표:** 플랫폼 API 키(`APIKey`)에 **scope**를 두고, 키별로 허용 API를 제한. 유출 시 피해 범위 축소.

### 2.1 스키마

- `api_keys` 테이블에 `scope` 추가.  
  - 타입: `Text` 또는 `JSON` (예: `["ingest","read"]`).  
  - 기본값: 기존 키 호환용 `["ingest"]` 또는 `["*"]`(전체 허용).
- (선택) `project_id` nullable 추가 → 키를 특정 프로젝트로만 제한.

### 2.2 Scope 정의

- 예시 (경로/역할 기준):  
  - `ingest` — `POST /api/v1/projects/{id}/api-calls`  
  - `read` — `GET .../api-calls`, `GET .../quality/scores`, `GET .../behavior/reports` 등 읽기 전용  
  - `evaluate` — `POST .../quality/evaluate`, `POST .../behavior/validate`, `POST .../behavior/compare`  
  - `release_gate` — `POST .../release-gate/validate`, `.../validate-async`  
  - `*` — 전체(기존 동작 유지)
- “이 경로는 이 scope 필요” 매핑을 한 곳(예: 상수 dict 또는 설정)에 정의.

### 2.3 인증 플로우 확장

- `get_user_from_api_key`:  
  - `APIKey` 조회 시 `scope` 컬럼 읽기.  
  - `request.state.auth_method = "api_key"`, `request.state.api_key_scope = [...].copy()` 설정.  
  - JWT일 때는 `request.state.auth_method = "jwt"`, `request.state.api_key_scope = None` (전체 허용으로 간주).
- `get_current_user_or_api_key` 사용 엔드포인트에서만 scope 검사 필요.  
  - JWT면 통과, API 키면 `request.state.api_key_scope`로 검사.

### 2.4 Scope 검사

- **방식 A (의존성):**  
  - `require_scope("ingest")` 같은 의존성 추가.  
  - 내부에서 `request.state.auth_method`, `request.state.api_key_scope` 확인 후, 필요 scope 없으면 403.
- **방식 B:**  
  - `get_current_user_or_api_key` 대신 `get_current_user_or_api_key_scoped(required_scope="ingest")` 형태로, 인증 + scope 검사 한 번에.

### 2.5 키 생성/관리

- 플랫폼 API 키 생성/수정 시 `scope` 입력받아 저장.  
- UI/API: 기본값 `["ingest"]`, 필요 시 `read`, `evaluate`, `release_gate` 등 선택.

**수정/추가 파일**

- `backend/app/models/api_key.py` — `scope` (및 선택적 `project_id`) 추가.  
- `backend/alembic/versions/` — migration.  
- `backend/app/core/security.py` — `get_user_from_api_key`에서 scope 읽어서 `request.state` 설정; (선택) `get_current_user`에서도 `request.state.auth_method = "jwt"` 설정.  
- `backend/app/core/dependencies.py` (또는 security.py) — `require_scope(scope: str)` 또는 `get_current_user_or_api_key_scoped(required_scope=...)`.  
- 경로별 필요 scope 매핑 상수 (예: `PATH_SCOPE_MAP`).  
- Ingest 등 API 키 허용 경로에 `require_scope("ingest")` 적용.

---

## 적용 순서 체크리스트

### Phase 1 (단기)

- [x] Rate limit 미들웨어에서 JWT decode로 user_id 추출 (`rate_limit.py`)
- [x] `rate_limit:user:{user_id}` 체크/증가, 한도 초과 시 429
- [x] (선택) API 키로 인증된 요청은 IP만 적용, user 한도는 JWT 요청에만 적용 — 구현됨

### Phase 2 (중기)

- [x] `api_keys.scope` 스키마 + migration (`20260315_add_api_keys_scope.py`)
- [x] `get_user_from_api_key` / `get_current_user_or_api_key` 에서 scope·auth_method 를 `request.state`에 설정
- [x] `RequireScope(scope)` 의존성 + ingest 엔드포인트에 `RequireScope("ingest")` 적용
- [x] Ingest: API 키는 scope에 `ingest` 또는 `*` 필요
- [x] 키 생성/관리: CreateAPIKeyRequest.scope, rotate 시 기존 키 scope 유지

### Phase 2 이후 (선택)

- [ ] API 키당 rate limit: `rate_limit:apikey:{key_id}` 로 키 단위 한도
- [ ] 프로젝트 단위 한도: `project_id` 로 집계해 프로젝트별 상한

---

## 참고

- OWASP API Security Top 10: rate limit은 API4:2023 Unrestricted Resource Consumption 권장 사항과 부합.
- Stripe / Twilio: 권한 기반 API 키(scope) 패턴 참고.
