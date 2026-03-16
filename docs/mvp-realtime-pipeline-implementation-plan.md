# 실시간 파이프라인 구현 계획 (경쟁사 수준)

## 목표
- **SDK**: 호출 경로 부담 최소화(큐 + 배치 + 백그라운드 전송)
- **백엔드**: 수신 즉시 202, 저장/평가는 큐 + 워커
- **UI**: Live View가 "인풋 들어온 뒤 수 초 이내" 반영

---

## Phase 1: 즉시 적용 (데모/소규모 체감 개선)

| # | 작업 | 내용 | 상태 |
|---|------|------|------|
| 1.1 | SDK URL 수정 | `POST /api/v1/api-calls` → `POST /api/v1/projects/{project_id}/api-calls` | ✅ |
| 1.2 | Live View 폴링 | `agents` useSWR에 `refreshInterval: 2000`(2초) 추가 | ✅ |
| 1.3 | (선택) ingest 지연 확인 | `save_api_call_async` 처리 시간·병목 로그 확인 | ⬜ |

**산출물**: SDK가 올바른 엔드포인트로 전송, Live View가 2~3초 간격으로 갱신  
**기간**: 1~2일

---

## Phase 2: SDK 큐 + 배치 + 백그라운드

| # | 작업 | 내용 | 상태 |
|---|------|------|------|
| 2.1 | Python SDK 로컬 큐 | 이벤트를 메모리 큐(deque/queue)에 적재, 메인 경로는 non-blocking | ✅ |
| 2.2 | 백그라운드 전송 | 전용 스레드로 주기적으로 큐에서 꺼내 전송 | ✅ |
| 2.3 | 배치 정책 | `flush_at`(개수), `flush_interval`(초) 옵션; 기본값 예: 10개 또는 5초 | ✅ |
| 2.4 | `flush()` / `shutdown()` | 서버리스·스크립트 종료 시 대기 중 이벤트 전송 보장 | ✅ |
| 2.5 | Node SDK (있는 경우) | 동일 패턴 적용 | ⬜ |

**의존성**: 없음  
**기간**: 3~5일

---

## Phase 3: 백엔드 큐 + 워커

| # | 작업 | 내용 | 상태 |
|---|------|------|------|
| 3.1 | 큐 선택·설정 | Redis(기존 활용) 또는 Redis Stream; PoC는 Redis 리스트/Stream | ✅ |
| 3.2 | Ingest API 변경 | 요청 검증 후 payload를 큐에만 push, 202 반환 | ✅ |
| 3.3 | 워커 프로세스 | 큐에서 pop → `_save_api_call_sync`(DB + eval) 호출, 재시도 정책 | ✅ |
| 3.4 | 배포 | 워커를 별도 프로세스/컨테이너로 실행 (Procfile 등) | ✅ |
| 3.5 | 모니터링 | 큐 길이, 워커 처리량/에러 메트릭 (워커 로그로 최소 구현) | ✅ |

**의존성**: Redis(또는 선택한 큐) 인프라  
**기간**: 5~7일

---

## Phase 4: 실시간 UI (Live View) — 보류

| # | 작업 | 내용 | 상태 |
|---|------|------|------|
| 4.1 | Option A: 폴링 강화 | agents/스냅샷 useSWR을 1~2초 `refreshInterval`로 단축 | 보류 |
| 4.2 | Option B: 푸시 알림 | 스냅샷 저장 시 "project X 새 스냅샷" 이벤트 발행; 프론트 SSE/WebSocket 구독 후 SWR mutate | 보류 |
| 4.3 | SSE/WebSocket 엔드포인트 | 예: `GET /api/v1/projects/{id}/live-view/stream` (SSE) | 보류 |

**판단**: 2초 폴링 + 큐/워커로 현재 목적 충족. 푸시는 트래픽·피드백 시 재검토.

---

## 안정화 (Phase 1~3 운영)

| # | 작업 | 내용 | 상태 |
|---|------|------|------|
| S.1 | 프로덕션 worker 실행 | Procfile `worker` 프로세스 실제 기동 (Railway 등에서 worker dyno 활성화) | ⬜ |
| S.2 | REDIS_URL 확인 | 프로덕션/스테이징에 Redis 주소 설정 (없으면 ingest는 in-process 폴백) | ⬜ |
| S.3 | 워커 로깅 | 100건마다 처리 건수, 60초마다 큐 깊이 로그 (구현됨) | ✅ |
| S.4 | 운영 가이드 | 아래 "운영 가이드" 참고 | ✅ |

---

## 운영 가이드 (Ingest / Worker)

- **Redis 없음**: SDK → `POST .../api-calls` 시 in-process로 저장 (기존과 동일). **워커 실행 불필요.**
- **Redis 있음**: API는 payload를 `ingest:api_calls` 큐에만 넣고 202 반환. **별도 프로세스로 ingest worker 실행 필요.**
  - 로컬: `cd backend && python -m app.workers.ingest_worker` (Redis 주소는 `REDIS_URL`, 예: `redis://localhost:6379/0`)
  - 프로덕션: Procfile의 `worker: python -m app.workers.ingest_worker` 로 worker dyno/프로세스 기동
- **로그**: 워커는 100건 처리마다, 60초 idle마다 큐 깊이·처리 건수 로그 출력. 큐가 지속적으로 쌓이면 워커 수 증가 또는 처리 병목 확인.

---

## 전체 순서·의존성

```
Phase 1 (즉시) → Phase 2 (SDK) ─────────────────┐
        ↓                                        ↓
   데모/체감 개선                    Phase 3 (큐+워커) → Phase 4 (UI 푸시)
```

---

## 리스크·가정
- **Redis**: 이미 사용 중이면 Stream/리스트만 추가. 없으면 managed Redis 도입.
- **워커 스케일**: 단일 워커로 시작, 트래픽 증가 시 워커 수·파티션 키(project_id)로 확장.
- **순서**: 같은 프로젝트 내 "대략 순서" 유지면 단일 큐로 충분.

---

## 체크리스트 업데이트
- Phase 완료 시 위 표의 `⬜`를 `✅`로 수동 갱신.
