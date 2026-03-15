# frontend/lib/api.ts 도메인별 분리 설계

## 목적
- 단일 2300줄+ 파일을 도메인별로 나누어 탐색·병합·유지보수 부담 감소
- **기존 `import { x } from "@/lib/api"` 호출은 그대로 유지** (index에서 re-export)

---

## 1. 디렉터리 구조

```
frontend/lib/
  api/
    client.ts       # 공유 axios 인스턴스, 인터셉터, 유틸
    index.ts        # 전역 re-export (기존 import 경로 유지)
    auth.ts
    organizations.ts
    projects.ts
    api-calls.ts
    quality.ts
    drift.ts
    alerts.ts
    cost.ts
    billing.ts
    subscription.ts
    settings.ts
    test-runs.ts
    export.ts
    activity.ts
    notifications.ts
    reports.ts
    webhooks.ts
    replay.ts
    onboarding.ts
    model-validation.ts
    shared-results.ts
    judge-feedback.ts
    live-view.ts
    self-hosted.ts
    dashboard.ts
    notification-settings.ts
    project-user-api-keys.ts
    rule-market.ts
    admin.ts
    health.ts
    public-benchmarks.ts
    internal-usage.ts
    behavior.ts
    release-gate.ts
    types.ts        # 공유 타입 (PlanType, OrganizationSummary, Project, ReleaseGateResult 등)
```

---

## 2. client.ts (공유 코어)

**내용**
- `API_URL`, `API_TIMEOUT_MS`
- `apiClient` – `axios.create()` + baseURL, timeout, headers
- `PUBLIC_PATHS`, `isPublicPath(url)`
- `logError`, `logWarn`
- `unwrapResponse(response)`, `unwrapArrayResponse(response)`
- request 인터셉터 (token 첨부, 비인증 시 로그인 리다이렉트)
- response 인터셉터 (401 refresh, 403 upgrade, 404 로그)

**export**
- `apiClient`
- `unwrapResponse`, `unwrapArrayResponse`
- `logError`, `logWarn`

**의존성**
- `axios`
- `@/lib/validate` 사용하지 않음 (각 도메인에서 직접 import)

---

## 3. types.ts (공유 타입)

**내용**
- `PlanType`, `OrganizationSummary`, `OrganizationDetail`, `OrganizationProject`, `Project`
- `RuleJSON`, `BehaviorRule`, `ValidationReport`, `CompareResult`, `CIGateResult`
- `BehaviorChangeBand`, `BehaviorDiffResult`
- `ReleaseGateAttempt`, `ReleaseGateRunSummary`, `ReleaseGateViolation`, `ReleaseGateRunResult`
- `ReleaseGateResult`, `ReleaseGateHistoryItem`, `ReleaseGateHistoryResponse`
- 기타 여러 도메인에서 참조하는 인터페이스/타입

**의존성**
- 없음 (순수 타입)

---

## 4. 도메인 파일 매핑

| 파일 | export 대상 | 비고 |
|------|-------------|------|
| `auth.ts` | `authAPI` | |
| `organizations.ts` | `organizationsAPI` | 내부: normalizeOrganization, normalizeOrganizationDetail, normalizeOrganizationProject (또는 types + normalizers) |
| `projects.ts` | `projectsAPI`, `projectMembersAPI` | |
| `api-calls.ts` | `apiCallsAPI` | |
| `internal-usage.ts` | `internalUsageAPI` | |
| `quality.ts` | `qualityAPI` | |
| `drift.ts` | `driftAPI` | |
| `alerts.ts` | `alertsAPI` | |
| `cost.ts` | `costAPI` | |
| `billing.ts` | `billingAPI` | |
| `subscription.ts` | `subscriptionAPI` | |
| `settings.ts` | `settingsAPI` | |
| `test-runs.ts` | `testRunsAPI` | |
| `export.ts` | `exportAPI` | |
| `activity.ts` | `activityAPI` | |
| `notifications.ts` | `notificationsAPI` | |
| `reports.ts` | `reportsAPI` | |
| `webhooks.ts` | `webhooksAPI` | |
| `replay.ts` | `replayAPI` | |
| `onboarding.ts` | `onboardingAPI` | |
| `model-validation.ts` | `modelValidationAPI` | |
| `shared-results.ts` | `sharedResultsAPI` | |
| `judge-feedback.ts` | `judgeFeedbackAPI` | |
| `live-view.ts` | `liveViewAPI` | |
| `self-hosted.ts` | `selfHostedAPI` | |
| `dashboard.ts` | `dashboardAPI` | |
| `notification-settings.ts` | `notificationSettingsAPI` | |
| `project-user-api-keys.ts` | `projectUserApiKeysAPI` | |
| `rule-market.ts` | `ruleMarketAPI` | |
| `admin.ts` | `adminAPI` | |
| `health.ts` | `healthAPI` | |
| `public-benchmarks.ts` | `publicBenchmarksAPI` | |
| `behavior.ts` | `behaviorAPI` | |
| `release-gate.ts` | `releaseGateAPI` | |

---

## 5. 각 도메인 파일 공통 패턴

```ts
// 예: alerts.ts
import { apiClient, unwrapResponse, logWarn } from "@/lib/api/client";
import { validateArrayResponse } from "@/lib/validate";
import { AlertSchema } from "@/lib/schemas";

export const alertsAPI = {
  list: async (projectId: number, params?: any) => { ... },
  get: async (projectId: number, id: number) => { ... },
  ...
};
```

- 스키마/검증: `@/lib/validate`의 `validateArrayResponse`, `@/lib/schemas`의 스키마를 필요한 곳에서만 import
- `apiClient`, `unwrapResponse`, `logWarn` 등은 `@/lib/api/client`에서만 import (도메인 파일끼리 직접 참조 없음)

---

## 6. index.ts (re-export)

```ts
// frontend/lib/api/index.ts
export { apiClient, unwrapResponse, unwrapArrayResponse, logError, logWarn } from "./client";
export * from "./types";
export { authAPI } from "./auth";
export { organizationsAPI } from "./organizations";
export { projectsAPI, projectMembersAPI } from "./projects";
export { apiCallsAPI } from "./api-calls";
// ... 위 표의 모든 API·타입
```

- 기존 `import { authAPI, projectsAPI, ReleaseGateResult } from "@/lib/api"` 등은 **경로를 `@/lib/api`로 유지**하고, `lib/api.ts`를 `lib/api/index.ts`로 대체하면 됨 (또는 `lib/api.ts`가 `export * from "./api"` 한 줄만 두고 실제 코드는 `lib/api/` 아래에 두어도 됨).

---

## 7. 마이그레이션 순서 (에러 최소화)

1. **`lib/api/` 디렉터리 생성**
2. **`client.ts`** – 기존 api.ts 상단에서 axios 설정·인터셉터·unwrap·log 함수만 잘라서 이동, export
3. **`types.ts`** – 기존 api.ts의 `export type`, `export interface`만 이동
4. **도메인 파일** – 한 번에 하나씩:
   - auth → organizations → projects → api-calls → … → behavior → release-gate
   - 각 단계에서 해당 블록만 새 파일로 옮기고, `client`/`types`/`@/lib/validate`/`@/lib/schemas`만 import
5. **`index.ts`** – client, types, 모든 도메인에서 re-export
6. **`lib/api.ts` 제거 후 진입점 통일**
   - 옵션 A: `lib/api.ts` 삭제하고, 전체 코드베이스에서 `@/lib/api`가 `lib/api/index.ts`를 가리키게 함 (Next/tsconfig에 따라 `lib/api`만으로 디렉터리 진입 가능)
   - 옵션 B: `lib/api.ts`를 `export * from "./api/index";` 한 줄로 유지
7. **린트/빌드** – `npm run lint`, `npm run build`로 import 누락·순환 참조 확인

---

## 8. 주의사항

- **순환 참조**: 도메인 파일은 `client`·`types`·`validate`·`schemas`만 참조. 도메인 간 상호 import 금지.
- **정규화 함수**: `normalizeOrganization`, `normalizeOrganizationProject` 등은 해당 API가 있는 파일(`organizations.ts`) 내부에 두거나, 같은 파일 하단의 private 함수로 유지.
- **기존 호출부**: `from "@/lib/api"` 인 import는 **수정하지 않음**. index re-export만으로 유지.

이 설계대로 진행하면 `lib/api.ts` 분리 후에도 기존 사용처 변경 없이 단순화할 수 있다.
