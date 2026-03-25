# 프론트엔드 리팩터링 계획 (실행 백로그)

**대상:** Live View, Release Gate, Organization/Project, 로그인·회원가입, 공통 API  
**목표:** 유지보수성·429/폴링 안정성·온보딩 변경 비용을 낮춤 (동작·URL·API 계약 동일)

**비목표:** 백엔드 스키마 대개편, 디자인 시스템 전면 교체, React/Next 강제 메이저 업그레이드.

---

## 원칙

1. **수직 슬라이스:** 한 PR에 한 사용자 플로우가 깨지지 않게.
2. **측정 가능한 완료:** 각 작업에 DoD(완료 정의) 명시.
3. **문서:** 폴링·429·SWR 키는 이동 시 [`live-view-rg-polling-inventory.md`](./live-view-rg-polling-inventory.md) 등에 반영.

---

## 완료 (참고만)

| 구간 | 내용 |
|------|------|
| **Phase 0** | 핵심 플로우 5개(부록 A), 폴링·429·SWR 키 인벤토리 |
| **Phase 1A** | LV 상수·SWR 기본값·`useLiveViewCoreData`·SSE mutate 훅·401/429 패턴 점검 |

상세 히스토리는 Git/PR과 [`live-view-rg-polling-inventory.md`](./live-view-rg-polling-inventory.md)를 본다.

---

## 해야 할 일 (백로그)

### Live View — Phase 1B·1C·1D

**목표:** `live-view/page.tsx`를 캔버스·패널·데이터 경계로 나누고 크기·가독성을 맞춤.

| ID | 작업 | DoD |
|----|------|-----|
| **1B.1** | `ReactFlowProvider` + 노드/엣지 타입 래퍼 → `LiveViewFlowShell.tsx` | `page`에서 해당 블록 1컴포넌트로 치환 |
| **1B.2** | `LiveViewToolbar` props 타입 문서화·export | `readonly` 콜백 명시 |
| **1B.3** | `useNodesState`/`useEdgesState`·undo/redo → `useLiveViewGraphState.ts` | undo 시맨틱 동일 |
| **1B.4** | 스냅샷→플로우 매핑 순수 함수 + Vitest 1~2개 | 엣지 케이스 1개 |
| **1C.1** | 레이아웃·Railway·포커스 → `LiveViewPageLayout.tsx` | drilling 감소 또는 context 1곳 |
| **1C.2** | 패널용 props → `LiveViewPanelProps` 등으로 묶기 | `Pick` 또는 명시 타입 |
| **1C.3** | `AgentCardNode`의 RG 관련 props 표 정리 | RG와 중복 필드 식별 |
| **1D.1** | `live-view/page.tsx` 줄 수 목표(팀 합의, 예: ≤350) | `page.tsx`는 셸만(~15줄). 본문은 `LiveViewContent.tsx`(추가 분해 시 ≤350 목표) |
| **1D.2** | 스모크(수동 또는 E2E) 통과 | 부록 A 플로우 중 LV·RG 샘플 |

### Release Gate — Phase 2A

**전제:** 도메인 훅·설정 패널 등은 이미 분리됨. **페이지 셸**만 더 얇게.  
**추가:** 오케스트레이션 본문은 `useReleaseGatePageModel.ts`, `ReleaseGatePageContent.tsx`는 providers + 레이아웃만.  
**정리:** 모델 훅에서 컨텍스트로 쓰이지 않던 로컬 state·미사용 파생값 제거. Live View 에이전트 동기화 시 히스토리 시드는 `setHistory` 함수형 업데이트 + `queueMicrotask(setHistoryIndex)`.  
**슬림화(오케스트레이션):** `useReleaseGatePageLocalState`(§2), `useReleaseGateRunDataDerivations`(코어 모델·리포트·라이브 노드 SWR 및 파생값), `useReleaseGateBaselineDetailSnapshot`, `useReleaseGateToolContextLoader`로 `useReleaseGatePageModel` 본문 축소(계약 동일).  
**Context/return:** `releaseGatePageContextParams` + `useReleaseGatePageContextParams`로 flat context 입력 조립, `useReleaseGatePageContextValue`는 `[p]` 단일 의존(입력은 반드시 위 훅 경유). `useReleaseGatePageModelReturn`에 validate-run·gate body·키 배너 슬라이스.

| ID | 작업 | DoD |
|----|------|-----|
| **2A.1** | `ReleaseGatePageContent.tsx` 목차 주석(섹션 5~8개) | 신규 기여자 구조 파악 용이 |
| **2A.2** | Context 묶음 → `ReleaseGateProviders.tsx` | 단일 래퍼 |
| **2A.3** | 초기 SWR 묶음 → `useReleaseGatePageBootstrap.ts` | 로딩/에러 동일 |
| **2A.4** | validate deps 브리지 → `useReleaseGateValidateBridge.ts` | deps 동기화 한 파일 |
| **2A.5** | 맵/expanded 분기만 셸에 잔류 | 파일 길이 실질 감소 |

---

## 선택·필요 시 (이 문서에서 펼치지 않음)

- **2B** LV↔RG 공통 타입·Run 버튼 상태 다이어그램 — 경계 이슈 나올 때.
- **3A** 로그인 페이지 폼/훅 분리 — 해당 파일을 자주 고칠 때.
- **3B** org/project 403·로딩 패턴·라우트 가드 — 접근 UX 정리할 때.
- **4** API `client.ts` 분리·429 운영 데이터 기반 조정 — [`rate-limit-heavy-endpoints-design.md`](./rate-limit-heavy-endpoints-design.md) 등과 함께.
- **E2E(구 0.4)·1D.3 Vitest** — CI/품질 목표가 생기면 별도 작업으로.
- **5.3** 분기별 플로우 검증 — 프로세스 문서가 필요하면 별도.

**지속 규율(권장, 가벼움):** 신규 파일 줄 수 소프트 상한 합의, PR에 스모크 5분 체크리스트(`.github/pull_request_template.md` 활용).

---

## 체크리스트 (미완료)

```
Phase 1B  [x] 1B.1–1B.4
Phase 1C  [x] 1C.1–1C.3
Phase 1D  [x] 1D.1 셸 분리 · [ ] 1D.2 스모크
Phase 2A  [x] 2A.1–2A.5
```

---

## 부록 A — 핵심 사용자 플로우 (재현용)

*로그인된 계정·해당 org/project 권한 필요.*

1. **로그인:** `/login` → 성공 시 `/organizations` (또는 redirect).
2. **회원가입:** `/login?mode=signup` → 온보딩 후 `/organizations`.
3. **프로젝트:** `/organizations/{orgId}/projects` → 프로젝트 선택 → `/organizations/{orgId}/projects/{projectId}`.
4. **Live View:** `.../live-view` — 노드·패널·SSE/폴링.
5. **Release Gate:** `.../release-gate` — baseline·설정·Validate·히스토리.

---

## 부록 B — `AgentCardNode` 노드 `data` (Live View ↔ Release Gate)

| 구분 | 출처 | 비고 |
|------|------|------|
| `label`, `model`, `total`, `worstCount`, `isOfficial`, `isGhost`, `driftStatus`, `signals`, `blur` | Live View: `mapAgentsToLiveViewNodes` → `node.data` | RG 맵에서도 동일 필드로 카드 요약에 사용 가능 |
| `theme` | LV 기본 `liveView` | RG: `releaseGate` |
| `rgDetails` (config, toolsCount, prompt, …) | LV에서는 미설정 | RG: `useReleaseGateExpandedViewModel` 등에서 주입 |

---

## 관련 문서

- [`live-view-rg-polling-inventory.md`](./live-view-rg-polling-inventory.md)
- [`rate-limit-heavy-endpoints-design.md`](./rate-limit-heavy-endpoints-design.md)
- [`frontend-api-split-design.md`](./frontend-api-split-design.md)
- [`node-live-view-release-gate-alignment-plan.md`](./node-live-view-release-gate-alignment-plan.md)
