# PluvianAI — 문서 안내

**브랜드**: PluvianAI  

이 저장소에서 **제품·명세·설계 문서의 본문은 `docs/`** 아래에 둡니다. 루트에는 `README.md`, `SECURITY.md`, `POST_MVP_HARDENING_ROADMAP.md` 등만 있습니다.

**정리 (2026-03)**: 일회성 초안(소셜 스레드 모음, 에이전트 테스트 런북, 보안 점검 1회성 리포트, 브라우저 토이 런북, drift/regression 이슈 스크래치패드, 수동 엔드포인트 표 — `endpoints-verification`), 폐기된 콘텐츠 플레이북은 삭제해 중복·고아 링크를 줄였습니다.

---

## 빠른 링크

| 영역 | 문서 |
|------|------|
| 청사진·스키마·PRD | [BLUEPRINT.md](./BLUEPRINT.md), [SCHEMA_SPEC.md](./SCHEMA_SPEC.md), [PRD_AGENT_BEHAVIOR_VALIDATION.md](./PRD_AGENT_BEHAVIOR_VALIDATION.md), [BUSINESS_PLAN.md](./BUSINESS_PLAN.md) |
| 접근 제어·보안 | [authorization-and-scoping.md](./authorization-and-scoping.md), [mvp-endpoint-access-matrix.md](./mvp-endpoint-access-matrix.md), [mvp-endpoint-access-gap-list.md](./mvp-endpoint-access-gap-list.md), [security-and-data-retention.md](./security-and-data-retention.md), [rate-limit-heavy-endpoints-design.md](./rate-limit-heavy-endpoints-design.md), [security-roadmap-per-user-rate-limit-and-api-key-scope.md](./security-roadmap-per-user-rate-limit-and-api-key-scope.md) |
| Live View·프라이버시·ingest | [live-view-node-lifecycle-policy.md](./live-view-node-lifecycle-policy.md), [live-view-context-privacy-plan.md](./live-view-context-privacy-plan.md), [live-view-ingest-field-matrix.md](./live-view-ingest-field-matrix.md), [live-view-trust-data-collection.md](./live-view-trust-data-collection.md), [TOOL_EVENTS_SCHEMA.md](./TOOL_EVENTS_SCHEMA.md), [why-send-tool-results.md](./why-send-tool-results.md) |
| Release Gate | [mvp-node-gate-spec.md](./mvp-node-gate-spec.md), [mvp-node-gate-implementation-checklist.md](./mvp-node-gate-implementation-checklist.md), [release-gate-tool-io-grounding-plan.md](./release-gate-tool-io-grounding-plan.md), [release-gate-request-body-overrides.md](./release-gate-request-body-overrides.md), [release-gate-report-context.md](./release-gate-report-context.md), [release-gate-node-ui-notes.md](./release-gate-node-ui-notes.md), [manual-test-scenarios-mvp-replay-test.md](./manual-test-scenarios-mvp-replay-test.md) |
| 노드 단위 제품 스토리 | [node-live-view-release-gate-alignment-plan.md](./node-live-view-release-gate-alignment-plan.md) |
| 프론트엔드 | [frontend-refactoring-implementation-plan.md](./frontend-refactoring-implementation-plan.md) (**진행 중**), [frontend-api-split-design.md](./frontend-api-split-design.md), [UI_GUIDE.md](./UI_GUIDE.md) |
| 실시간 파이프라인·운영 | [mvp-realtime-pipeline-implementation-plan.md](./mvp-realtime-pipeline-implementation-plan.md), [ops-ingest-observability.md](./ops-ingest-observability.md), [mvp-ops-alerting-minimum-plan.md](./mvp-ops-alerting-minimum-plan.md), [mvp-ops-slack-alerts-implementation-plan.md](./mvp-ops-slack-alerts-implementation-plan.md) |
| Behavior API | [BEHAVIOR_RULE_API_CONTRACT.md](./BEHAVIOR_RULE_API_CONTRACT.md) |
| 요금·크레딧 | [mvp-usage-credits-and-pricing-plan.md](./mvp-usage-credits-and-pricing-plan.md), [mvp-usage-credits-implementation-checklist.md](./mvp-usage-credits-implementation-checklist.md), [mvp-free-tier-limits-implementation-plan.md](./mvp-free-tier-limits-implementation-plan.md) |
| 감사·역할·법무 | [audit-live-view-soft-delete-and-related.md](./audit-live-view-soft-delete-and-related.md), [role-action-matrix.md](./role-action-matrix.md), [role-action-gap-analysis.md](./role-action-gap-analysis.md), [legal-package-baseline.md](./legal-package-baseline.md) |
| 시장 조사 (보조) | [LLM_EVAL_MARKET_RESEARCH.md](./LLM_EVAL_MARKET_RESEARCH.md), [LLM_EVAL_MARKET_RESEARCH_V2.md](./LLM_EVAL_MARKET_RESEARCH_V2.md) (V2는 V1 보조) |
| 데모 | [demo/README.md](./demo/README.md), [demo/content-and-demo-execution-plan.md](./demo/content-and-demo-execution-plan.md), [demo/demo-support-bot-a1-plan.md](./demo/demo-support-bot-a1-plan.md), [demo/content-plan-support-bot-screenshots.md](./demo/content-plan-support-bot-screenshots.md) |

---

## 주의

- 구현 상태는 문서 제목·본문·체크리스트를 함께 보고 판단하세요. 특히 `mvp-*-implementation-checklist.md`와 `*-plan.md`는 **계획과 완료가 섞여 있을 수 있습니다**.
- `TEST_PLAN.md`, `PLUVIANAI_LANDING_IMPLEMENTATION.md` 등 루트 전용 파일은 이 저장소 루트에 없을 수 있습니다 — 필요 시 별도 추가합니다.
