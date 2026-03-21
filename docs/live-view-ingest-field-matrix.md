# Ingest / 스냅샷 필드 매트릭스 (Live View)

> 서버 구현: [`APICallIngestBody`](../backend/app/api/v1/endpoints/api_calls.py), [`normalize_tool_events`](../backend/app/utils/tool_events.py) (`MAX_TOOL_EVENTS=50`, 이벤트당 `MAX_EVENT_JSON_CHARS`).

| 영역 | 필드 / 키 | Live View 표시 | 민감도 | 비고 |
|------|-----------|----------------|--------|------|
| Ingest | `request_data` | `payload.request`로 저장 후 요청 컨텍스트 패널 | **높음** (프롬프트·PII) | OpenAI 등 원본 요청 JSON |
| Ingest | `response_data` | 응답/에이전트 출력 영역 | **높음** | `choices`, `usage` 등 |
| Ingest | `tool_events[]` | Tool timeline | 중~높음 (인자·출력) | [`TOOL_EVENTS_SCHEMA.md`](./TOOL_EVENTS_SCHEMA.md) |
| 스냅샷 | `payload.request` | 동일 | 높음 | SDK 경로 기본 shape |
| 스냅샷 | `payload.tool_events` | Tool timeline (폴백) | 중~높음 | 궤적 없을 때 |
| 스냅샷 | `system_prompt`, `user_message` 컬럼 | 레거시 요약 컬럼 | 높음 | `messages`와 중복 시 UI에서 우선순위 규칙 적용 |
| 확장 (앱 커스텀) | `context`, `retrieved_chunks`, `documents`, `attachments`, `rag_context`, `sources` | “Extended context” 패널 | 높음 | 스키마 고정 전 휴리스틱 |

**우선순위 (요청 메시지)**: `payload.request.messages` (있으면 역할별 블록) → 없으면 `system_prompt` + `user_message` 컬럼.

**서버 redaction**: `redact_secrets` (ingest), `tool_timeline`용 redaction 버전은 API의 `tool_timeline_redaction_version`.
