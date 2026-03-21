# Ingest 관측 (Phase 4)

## 목적

- ingest 요청에서 **본문 내용 없이** `request_data` **키 구성**만 해시해 “빈 요청·비정상 페이로드” 비율을 로그/SIEM에서 집계할 수 있게 한다.
- [`live-view-context-privacy-plan.md`](./live-view-context-privacy-plan.md) §12.4와 정합.

## 이벤트

`POST /api/v1/projects/{project_id}/api-calls` 처리 시 (큐 푸시 또는 인프로세스 폴백 직전) **한 줄**로 JSON 로그에 포함된다.

| 필드 | 의미 |
|------|------|
| `event_type` | `ingest_request_shape` |
| `project_id` | 프로젝트 |
| `key_fp` | 정렬된 `request_data` 키 목록의 SHA-256 앞 16자 (내용 아님) |
| `key_count` | 최상위 키 개수 |
| `has_messages` | `messages` 키 존재 여부 |
| `empty_body` | 키가 비어 있음 |

## `OPS_RG_*` 와의 분리

- **Release Gate** 전용 알림(`OPS_RG_*`, `observe_release_gate_*`)은 **replay/툴 결과 부족** 등 게이트 품질에 초점을 둔다.
- **ingest_request_shape**는 **수집 파이프라인/고객 SDK 설정** 이상 징후(예: 빈 `request_data` 급증)용으로 **별도 대시보드/알림 규칙**을 권장한다. 동일 웹훅을 쓰더라도 `event_type`으로 필터한다.

## 관련 코드

- [`app/utils/ingest_observability.py`](../backend/app/utils/ingest_observability.py) — `request_data_shape_summary`
- [`app/api/v1/endpoints/api_calls.py`](../backend/app/api/v1/endpoints/api_calls.py) — `ingest_api_call`
