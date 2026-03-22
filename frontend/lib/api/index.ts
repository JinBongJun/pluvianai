/**
 * API client and domain modules – re-export all for backward compatibility.
 * Import from "@/lib/api" continues to work.
 */
export {
  apiClient,
  API_URL,
  logError,
  logWarn,
  unwrapResponse,
  unwrapArrayResponse,
} from "./client";

export type {
  PlanType,
  OrganizationSummary,
  OrganizationDetail,
  OrganizationProject,
  Project,
  RuleJSON,
  BehaviorRule,
  ValidationReport,
  CompareResult,
  CIGateResult,
  BehaviorChangeBand,
  BehaviorDiffResult,
  ReleaseGateAttempt,
  ReleaseGateRunSummary,
  ReleaseGateViolation,
  ReleaseGateRunResult,
  ReleaseGateResult,
  ReleaseGateReplayRequestMeta,
  ReleaseGateHistoryItem,
  ReleaseGateHistoryResponse,
} from "./types";

export { authAPI } from "./auth";
export { organizationsAPI } from "./organizations";
export { projectsAPI, projectMembersAPI } from "./projects";
export { apiCallsAPI } from "./api-calls";
export { internalUsageAPI } from "./internal-usage";
export { qualityAPI } from "./quality";
export { driftAPI } from "./drift";
export { alertsAPI } from "./alerts";
export { costAPI } from "./cost";
export { billingAPI } from "./billing";
export { subscriptionAPI } from "./subscription";
export { settingsAPI } from "./settings";
export { testRunsAPI } from "./test-runs";
export { exportAPI } from "./export";
export { activityAPI } from "./activity";
export { notificationsAPI } from "./notifications";
export { reportsAPI } from "./reports";
export { webhooksAPI } from "./webhooks";
export { replayAPI } from "./replay";
export { onboardingAPI } from "./onboarding";
export { modelValidationAPI } from "./model-validation";
export { sharedResultsAPI } from "./shared-results";
export { judgeFeedbackAPI } from "./judge-feedback";
export { liveViewAPI } from "./live-view";
export { selfHostedAPI } from "./self-hosted";
export { dashboardAPI } from "./dashboard";
export { notificationSettingsAPI } from "./notification-settings";
export { projectUserApiKeysAPI } from "./project-user-api-keys";
export { ruleMarketAPI } from "./rule-market";
export { adminAPI } from "./admin";
export { healthAPI } from "./health";
export { publicBenchmarksAPI } from "./public-benchmarks";
export { behaviorAPI } from "./behavior";
export { releaseGateAPI } from "./release-gate";
export type { ToolContextPayload, ToolContextInjectPayload } from "./release-gate";

import { apiClient } from "./client";
export default apiClient;
