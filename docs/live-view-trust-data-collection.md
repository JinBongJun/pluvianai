# 데이터 수집·표시 (Live View / Ingest) — 고객 안내

## 요약

- **저장되는 것** = 고객 앱이 **ingest API 또는 SDK**로 **실제로 보낸 페이로드**뿐입니다.
- **표시되는 것** = 저장된 데이터 + **프로젝트 정책** + 서버 측 **시크릿 마스킹**(`redact_secrets`)입니다.
- **보내지 않은 필드**는 당연히 UI에도 없습니다. “빈 화면”과 “수집 안 함”을 [라이브뷰 계획 §11.3](./live-view-context-privacy-plan.md#113-있음--없음-판별)처럼 구분해 안내합니다.

## SDK로 본문 전송 줄이기 (Python)

- 환경 변수 **`PLUVIANAI_LOG_USER_CONTENT=0`** (또는 `false`) 시 **요청 `messages` 본문·응답 `choices` 본문**을 `[omitted]`로 치환한 메타만 전송합니다. (메타: 역할, 길이 등)
- 세부 옵션은 [`sdk/python/README.md`](../sdk/python/README.md) **Security / Privacy** 절을 참고합니다.

## 엔드포인트

- `POST /api/v1/projects/{project_id}/api-calls` — 본문 스키마는 [`SCHEMA_SPEC.md`](./SCHEMA_SPEC.md) §2.2.1, [`TOOL_EVENTS_SCHEMA.md`](./TOOL_EVENTS_SCHEMA.md).

## 관련 문서

- [`live-view-context-privacy-plan.md`](./live-view-context-privacy-plan.md) — 구현 로드맵
- [`live-view-ingest-field-matrix.md`](./live-view-ingest-field-matrix.md) — 필드별 매트릭스
- [`ops-ingest-observability.md`](./ops-ingest-observability.md) — ingest 키 형태 관측(내용 비저장)
- 제품 내 고객용 페이지: **`/trust`** (Next.js `frontend/app/trust/page.tsx`)

---

## 예시 JSON (`APICallIngestBody` 계열)

아래는 **형태**만 보여 주는 예이며, 실제 `project_id`·토큰·본문은 환경에 맞게 바꿉니다.

### 허용 (권장: 최소 필요한 필드)

고객이 **의도적으로** 보낸 요청/응답만 서버에 남습니다. 툴은 선택.

```json
{
  "request_data": {
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "You are a support bot." },
      { "role": "user", "content": "Reset my password." }
    ]
  },
  "response_data": {
    "choices": [{ "message": { "role": "assistant", "content": "Here is how to reset…" } }]
  },
  "latency_ms": 420,
  "status_code": 200,
  "agent_name": "support-bot",
  "tool_events": []
}
```

### 비허용에 가깝지 않은 것(“나쁜 예”) — **빈 요청 / 의미 없는 ingest**

`request_data`가 비어 있으면 Live View에 **표시할 본문이 없음**이 정상입니다. (정책 vs 미수집 구분은 [`§11.3`](./live-view-context-privacy-plan.md#113-있음--없음-판별))

```json
{
  "request_data": {},
  "response_data": {},
  "latency_ms": 0,
  "status_code": 200,
  "agent_name": "unknown"
}
```

### SDK 프라이버시 플래그 후(메타만 남는 경우)

SDK가 본문을 생략하면 `_pluvianai_message_bodies_omitted` 등 **마커**가 남고, UI는 “Privacy” 안내를 띄웁니다. (실제 키 이름은 SDK/버전과 [`SCHEMA_SPEC.md`](./SCHEMA_SPEC.md) 참조)

```json
{
  "request_data": {
    "model": "gpt-4o-mini",
    "messages": [{ "role": "user", "content": "[omitted]" }],
    "_pluvianai_message_bodies_omitted": true
  },
  "response_data": { "choices": [] },
  "latency_ms": 200,
  "status_code": 200,
  "agent_name": "sdk-agent"
}
```
