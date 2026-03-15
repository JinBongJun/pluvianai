# PluvianAI — 문서 안내

**브랜드**: PluvianAI  
**저장소 경로**: 현재 워크스페이스 루트

---

## 문서 위치 (단일 소스)

문서는 **저장소 루트의 `.md` 파일**을 기준으로 합니다. 여기만 최신입니다.

| 문서 | 용도 |
|------|------|
| [README.md](./README.md) | 프로젝트 개요, 빠른 시작, 구조 |
| [BLUEPRINT.md](./BLUEPRINT.md) | 기술 청사진, 아키텍처, API, 로드맵 |
| [BUSINESS_PLAN.md](./BUSINESS_PLAN.md) | 사업계획서 |
| [SCHEMA_SPEC.md](./SCHEMA_SPEC.md) | API 스키마 명세 |
| [PRD_AGENT_BEHAVIOR_VALIDATION.md](./PRD_AGENT_BEHAVIOR_VALIDATION.md) | Behavior Validation PRD |
| [TEST_PLAN.md](./TEST_PLAN.md) | 통합 테스트 계획 |
| [PLUVIANAI_LANDING_IMPLEMENTATION.md](./PLUVIANAI_LANDING_IMPLEMENTATION.md) | 랜딩 페이지 구현 가이드 |

### docs/ 폴더 (권한·엔드포인트·감사)

| 문서 | 용도 |
|------|------|
| [authorization-and-scoping.md](./authorization-and-scoping.md) | 프로젝트 스코프 URL 규칙, RBAC, 스키마/유일 제약 체크리스트 |
| [mvp-endpoint-access-matrix.md](./mvp-endpoint-access-matrix.md) | 엔드포인트별 접근 권한 (역할·메서드) |
| [audit-live-view-soft-delete-and-related.md](./audit-live-view-soft-delete-and-related.md) | Live View·소프트삭제·멀티테넌트 관련 감사 요약 |

---

## 주의

- **`docs/` 폴더**에 예전에 있던 문서(BLUEPRINT, QUICK_START, DEPLOYMENT_GUIDE 등)는 **삭제되었거나 더 이상 업데이트되지 않습니다.**
- 확인할 때는 **반드시 루트의 위 목록 문서만** 참고하세요. 이전 버전 문서를 읽으면 내용이 달라서 헷갈릴 수 있습니다.
